/**
 * 공통 프로필 이미지 저장소의 MIME·크기·전체 디코딩 검증과 local·S3 저장, URL 소유권 경계를 검증합니다.
 * local 저장은 임시 폴더만 사용하고 테스트 종료 후 생성 파일을 모두 제거합니다.
 * S3 저장과 CloudFront 캐시 무효화는 실제 AWS에 접속하지 않고 S3 객체 저장 경계를 mock합니다.
 */
jest.mock("../../../src/common/uploads/s3-object-storage", () => ({
  deleteS3Object: jest.fn(),
  findCloudFrontObjectKey: jest.fn(),
  getCloudFrontUrl: jest.fn(),
  invalidateCloudFrontObject: jest.fn(),
  putS3Object: jest.fn(),
}));

import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import type { Request, Response } from "express";
import sharp from "sharp";

import { BadRequestError } from "../../../src/common/errors/app-error";
import {
  createProfileImageStorage,
  type ProfileImageStorage,
} from "../../../src/common/uploads/profile-image-storage";
import {
  deleteS3Object,
  findCloudFrontObjectKey,
  getCloudFrontUrl,
  invalidateCloudFrontObject,
  putS3Object,
} from "../../../src/common/uploads/s3-object-storage";
import { env } from "../../../src/config/env";

const CLOUDFRONT_ORIGIN = "https://d111111abcdef8.cloudfront.net/";
const UUID_FILE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** multer memoryStorage가 넘겨 주는 모양의 파일을 만듭니다. path·filename은 채워지지 않습니다. */
function createMemoryFile(buffer: Buffer, mimeType: string): Express.Multer.File {
  return {
    fieldname: "profileImage",
    originalname: "../../evil name.png",
    encoding: "7bit",
    mimetype: mimeType,
    size: buffer.length,
    destination: "",
    filename: "",
    path: "",
    buffer,
    stream: Readable.from([]),
  };
}

function createPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function createMultipartRequest(
  content: Buffer,
  mimeType: string,
  fileName: string,
): Request {
  const boundary = "moving-profile-boundary";
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="profileImage"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, content, suffix]);
  const request = Readable.from(body) as unknown as Request;

  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length),
  };
  request.is = () => "multipart/form-data";

  return request;
}

function runUpload(
  storage: ProfileImageStorage,
  request: Request,
): Promise<unknown> {
  return new Promise((resolve) => {
    storage.uploadProfileImage(
      request,
      {} as Response,
      (error?: unknown) => resolve(error),
    );
  });
}

describe("Profile image storage", () => {
  let temporaryDirectory = "";
  let storage: ProfileImageStorage;

  beforeEach(async () => {
    jest.resetAllMocks();
    // 실제 구현과 같은 규칙으로 CloudFront URL과 key를 변환합니다.
    jest.mocked(getCloudFrontUrl).mockImplementation((key) => `${CLOUDFRONT_ORIGIN}${key}`);
    jest.mocked(findCloudFrontObjectKey).mockImplementation((url) =>
      url.startsWith(CLOUDFRONT_ORIGIN) ? url.slice(CLOUDFRONT_ORIGIN.length) : null,
    );
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "profile-image-"));
    storage = createProfileImageStorage({
      uploadDirectory: temporaryDirectory,
      publicUrlPrefix: "/uploads/test-profiles/",
      s3KeyPrefix: "profile-images/tests/",
      maxBytes: 8,
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  describe("이미지 검증", () => {
    test("전체 디코딩 가능한 정적 PNG를 승인하고 검증만으로는 아무것도 저장하지 않는다", async () => {
      const file = createMemoryFile(await createPng(), "image/png");

      await expect(storage.validateUploadedProfileImage(file)).resolves.toBeUndefined();
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
      expect(putS3Object).not.toHaveBeenCalled();
    });

    test("MIME와 실제 디코딩 format이 다르면 거절한다", async () => {
      await expect(
        storage.validateUploadedProfileImage(createMemoryFile(await createPng(), "image/jpeg")),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    test("이미지가 아닌 내용, 정상 헤더만 남은 잘린 PNG, 손상된 JPEG를 거절한다", async () => {
      const jpeg = await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      await expect(
        storage.validateUploadedProfileImage(
          createMemoryFile(Buffer.from("not-an-image"), "image/jpeg"),
        ),
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        storage.validateUploadedProfileImage(
          createMemoryFile(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            "image/png",
          ),
        ),
      ).rejects.toBeInstanceOf(BadRequestError);
      await expect(
        storage.validateUploadedProfileImage(
          createMemoryFile(jpeg.subarray(0, jpeg.length - 10), "image/jpeg"),
        ),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    test("여러 프레임을 가진 animated WebP를 거절한다", async () => {
      const frames = await Promise.all(
        [
          { r: 255, g: 0, b: 0, alpha: 1 },
          { r: 0, g: 0, b: 255, alpha: 1 },
        ].map((background) =>
          sharp({
            create: { width: 2, height: 2, channels: 4, background },
          })
            .png()
            .toBuffer(),
        ),
      );
      const animatedWebp = await sharp(frames, { join: { animated: true } })
        .webp({ delay: [100, 100], loop: 0 })
        .toBuffer();

      await expect(
        storage.validateUploadedProfileImage(createMemoryFile(animatedWebp, "image/webp")),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    test("APNG animation control chunk가 있는 PNG를 거절한다", async () => {
      const png = await createPng();
      const firstChunkEnd = 8 + 4 + 4 + png.readUInt32BE(8) + 4;
      const animationControlChunk = Buffer.alloc(20);
      animationControlChunk.writeUInt32BE(8, 0);
      animationControlChunk.write("acTL", 4, "ascii");
      animationControlChunk.writeUInt32BE(1, 8);
      animationControlChunk.writeUInt32BE(0, 12);
      const apng = Buffer.concat([
        png.subarray(0, firstChunkEnd),
        animationControlChunk,
        png.subarray(firstChunkEnd),
      ]);

      await expect(
        storage.validateUploadedProfileImage(createMemoryFile(apng, "image/png")),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: "애니메이션 이미지는 업로드할 수 없습니다.",
      });
    });

    test("허용하지 않은 MIME와 최대 크기 초과 업로드를 VALIDATION_ERROR로 변환하고 디스크에 남기지 않는다", async () => {
      const invalidMimeError = await runUpload(
        storage,
        createMultipartRequest(Buffer.from("text"), "text/plain", "profile.txt"),
      );
      const oversizedError = await runUpload(
        storage,
        createMultipartRequest(Buffer.alloc(9, 0xff), "image/jpeg", "profile.jpg"),
      );

      expect(invalidMimeError).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
      expect(oversizedError).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
      });
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
    });

    test("multipart 업로드는 파일을 디스크가 아닌 메모리 buffer로 전달한다", async () => {
      const content = Buffer.from("12345678");
      const request = createMultipartRequest(content, "image/png", "profile.png");

      await expect(runUpload(storage, request)).resolves.toBeUndefined();

      expect(request.file?.buffer.equals(content)).toBe(true);
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
    });
  });

  describe("local 저장소", () => {
    test("원본 파일명 대신 UUID 이름으로 저장하고 역할별 상대 URL을 반환한다", async () => {
      const png = await createPng();
      const file = createMemoryFile(png, "image/png");

      const imageUrl = await storage.saveUploadedProfileImage(file);
      const [savedFileName] = await readdir(temporaryDirectory);

      expect(savedFileName).toMatch(UUID_FILE_NAME_PATTERN);
      expect(imageUrl).toBe(`/uploads/test-profiles/${savedFileName}`);
      await expect(
        readFile(path.join(temporaryDirectory, savedFileName ?? "")),
      ).resolves.toEqual(png);
      expect(putS3Object).not.toHaveBeenCalled();
    });

    test("파일이 없으면 저장하지 않고 undefined를 반환한다", async () => {
      await expect(storage.saveUploadedProfileImage(undefined)).resolves.toBeUndefined();
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
    });

    test("실패한 요청의 신규 업로드만 삭제하고 저장 전 파일은 건드리지 않는다", async () => {
      const savedFile = createMemoryFile(await createPng(), "image/png");
      const unsavedFile = createMemoryFile(await createPng(), "image/png");
      await storage.saveUploadedProfileImage(savedFile);

      // 저장하지 않은 파일은 정리할 것이 없으므로 그대로 성공합니다.
      await expect(storage.removeUploadedProfileImage(unsavedFile)).resolves.toBeUndefined();
      await expect(readdir(temporaryDirectory)).resolves.toHaveLength(1);

      await storage.removeUploadedProfileImage(savedFile);
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
      // 같은 파일을 다시 정리해도 오류 없이 끝납니다.
      await expect(storage.removeUploadedProfileImage(savedFile)).resolves.toBeUndefined();
    });

    test("소유한 UUID URL만 교체 정리하고 외부 URL과 경로 조작은 보존한다", async () => {
      const ownedFileName = "00000000-0000-0000-0000-000000000000.webp";
      const ownedPath = path.join(temporaryDirectory, ownedFileName);
      await writeFile(ownedPath, Buffer.from("old"));

      await storage.removeReplacedProfileImage("https://cdn.example.com/profile.webp");
      await storage.removeReplacedProfileImage(`/uploads/other-profiles/${ownedFileName}`);
      await storage.removeReplacedProfileImage(`/uploads/test-profiles/../${ownedFileName}`);
      await storage.removeReplacedProfileImage(null);
      await expect(access(ownedPath)).resolves.toBeUndefined();
      expect(deleteS3Object).not.toHaveBeenCalled();

      await storage.removeReplacedProfileImage(
        `/uploads/test-profiles/${ownedFileName}`,
      );
      await expect(access(ownedPath)).rejects.toThrow();
    });
  });

  describe("s3 저장소", () => {
    beforeEach(() => {
      jest.replaceProperty(env, "PROFILE_IMAGE_STORAGE", "s3");
    });

    test("검증된 buffer를 역할별 key prefix의 UUID key로 올리고 CloudFront URL을 반환한다", async () => {
      const png = await createPng();

      const imageUrl = await storage.saveUploadedProfileImage(
        createMemoryFile(png, "image/png"),
      );

      expect(putS3Object).toHaveBeenCalledTimes(1);
      const [input] = jest.mocked(putS3Object).mock.calls[0] ?? [];
      expect(input?.key.startsWith("profile-images/tests/")).toBe(true);
      expect(input?.key.slice("profile-images/tests/".length)).toMatch(UUID_FILE_NAME_PATTERN);
      expect(input?.body).toEqual(png);
      expect(input?.contentType).toBe("image/png");
      expect(imageUrl).toBe(`${CLOUDFRONT_ORIGIN}${input?.key}`);
      // 기대 결과: S3 저장소에서는 서버 디스크에 파일을 남기지 않습니다.
      await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
    });

    test("S3 저장 실패는 AWS 오류 원문을 숨기고 PROFILE_IMAGE_UPLOAD_FAILED(502)로 변환한다", async () => {
      jest.mocked(putS3Object).mockRejectedValue(
        new Error("AccessDenied: arn:aws:s3:::secret-bucket"),
      );
      const file = createMemoryFile(await createPng(), "image/png");

      await expect(storage.saveUploadedProfileImage(file)).rejects.toMatchObject({
        status: 502,
        code: "PROFILE_IMAGE_UPLOAD_FAILED",
        message: expect.not.stringContaining("secret-bucket"),
      });
      // 저장에 실패한 파일은 정리 대상으로 기록되지 않습니다.
      await storage.removeUploadedProfileImage(file);
      expect(deleteS3Object).not.toHaveBeenCalled();
    });

    test("실패한 요청에서 올린 S3 객체를 같은 key로 삭제한다", async () => {
      const file = createMemoryFile(await createPng(), "image/png");
      await storage.saveUploadedProfileImage(file);
      const [input] = jest.mocked(putS3Object).mock.calls[0] ?? [];

      await storage.removeUploadedProfileImage(file);

      expect(deleteS3Object).toHaveBeenCalledWith(input?.key);
      // 기대 결과: 주소가 응답된 적 없는 이미지는 캐시되지 않았으므로 무효화 경로를 쓰지 않습니다.
      expect(invalidateCloudFrontObject).not.toHaveBeenCalled();
    });

    test("교체된 이미지는 이 역할의 UUID key인 CloudFront URL만 삭제한다", async () => {
      const ownedKey = "profile-images/tests/00000000-0000-0000-0000-000000000000.jpg";

      await storage.removeReplacedProfileImage("https://cdn.example.com/profile.jpg");
      await storage.removeReplacedProfileImage(
        `${CLOUDFRONT_ORIGIN}profile-images/others/00000000-0000-0000-0000-000000000000.jpg`,
      );
      await storage.removeReplacedProfileImage(`${CLOUDFRONT_ORIGIN}profile-images/tests/manual.jpg`);
      await storage.removeReplacedProfileImage(
        `${CLOUDFRONT_ORIGIN}profile-images/tests/sub/00000000-0000-0000-0000-000000000000.jpg`,
      );
      expect(deleteS3Object).not.toHaveBeenCalled();
      // 소유하지 않은 URL은 삭제하지 않았으므로 캐시도 건드리지 않습니다.
      expect(invalidateCloudFrontObject).not.toHaveBeenCalled();

      await storage.removeReplacedProfileImage(`${CLOUDFRONT_ORIGIN}${ownedKey}`);
      expect(deleteS3Object).toHaveBeenCalledWith(ownedKey);
    });

    test("교체·탈퇴로 지운 S3 이미지는 삭제가 끝난 뒤 같은 key의 CloudFront 캐시를 무효화한다", async () => {
      const ownedKey = "profile-images/tests/00000000-0000-0000-0000-000000000000.jpg";
      const callOrder: string[] = [];
      jest.mocked(deleteS3Object).mockImplementation(async () => {
        callOrder.push("delete");
      });
      jest.mocked(invalidateCloudFrontObject).mockImplementation(async () => {
        callOrder.push("invalidate");
        return true;
      });

      await storage.removeReplacedProfileImage(`${CLOUDFRONT_ORIGIN}${ownedKey}`);

      expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(1);
      expect(invalidateCloudFrontObject).toHaveBeenCalledWith(ownedKey);
      // 원본이 남은 상태에서 무효화하면 다음 요청에 다시 캐시되므로 삭제가 먼저여야 합니다.
      expect(callOrder).toEqual(["delete", "invalidate"]);
    });

    test("무효화 요청이 실패하면 프로필 수정·탈퇴는 바로 성공시키고 같은 key로 백그라운드 재시도한다", async () => {
      const ownedKey = "profile-images/tests/00000000-0000-0000-0000-000000000000.jpg";
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      // 사전 조건: 첫 요청만 일시적 오류로 실패하고 재시도는 성공합니다.
      jest.mocked(invalidateCloudFrontObject)
        .mockRejectedValueOnce(new Error("TooManyInvalidationsInProgress"))
        .mockResolvedValue(true);
      jest.useFakeTimers();

      try {
        // 기대 결과: 재시도 대기 시간을 기다리지 않고 API 흐름이 끝납니다.
        await expect(
          storage.removeReplacedProfileImage(`${CLOUDFRONT_ORIGIN}${ownedKey}`),
        ).resolves.toBeUndefined();
        expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(5_000);
        expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(2);
        expect(invalidateCloudFrontObject).toHaveBeenLastCalledWith(ownedKey);

        // 성공한 뒤에는 더 요청하지 않고 실패 로그도 남기지 않습니다.
        await jest.advanceTimersByTimeAsync(600_000);
        expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(2);
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        consoleError.mockRestore();
      }
    });

    test("재시도가 모두 실패하면 요청을 멈추고 AWS 오류 원문 없이 고정 문구만 한 번 기록한다", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      jest.mocked(invalidateCloudFrontObject).mockRejectedValue(
        new Error("AccessDenied: arn:aws:cloudfront::123456789012:distribution/ESECRET"),
      );
      jest.useFakeTimers();

      try {
        await storage.removeReplacedProfileImage(
          `${CLOUDFRONT_ORIGIN}profile-images/tests/00000000-0000-0000-0000-000000000000.jpg`,
        );
        // 재시도가 남아 있는 동안에는 아직 실패로 기록하지 않습니다.
        expect(consoleError).not.toHaveBeenCalled();

        // 재시도 간격 5초·30초·2분이 모두 지나면 첫 요청 포함 4번 시도한 상태입니다.
        await jest.advanceTimersByTimeAsync(5_000 + 30_000 + 120_000);
        expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(4);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain("ESECRET");
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain("profile-images/tests");

        await jest.advanceTimersByTimeAsync(600_000);
        expect(invalidateCloudFrontObject).toHaveBeenCalledTimes(4);
      } finally {
        jest.useRealTimers();
        consoleError.mockRestore();
      }
    });

    test("S3 전환 전에 저장한 local 이미지도 교체되면 디스크에서 정리한다", async () => {
      const ownedFileName = "00000000-0000-0000-0000-000000000000.png";
      const ownedPath = path.join(temporaryDirectory, ownedFileName);
      await writeFile(ownedPath, Buffer.from("old"));

      await storage.removeReplacedProfileImage(`/uploads/test-profiles/${ownedFileName}`);

      await expect(access(ownedPath)).rejects.toThrow();
      expect(deleteS3Object).not.toHaveBeenCalled();
      // local 이미지는 CloudFront를 거치지 않으므로 무효화하지 않습니다.
      expect(invalidateCloudFrontObject).not.toHaveBeenCalled();
    });

    test("교체 이미지 삭제가 실패해도 이미 끝난 DB 변경을 되돌리지 않도록 오류를 던지지 않는다", async () => {
      jest.mocked(deleteS3Object).mockRejectedValue(new Error("S3 unavailable"));

      await expect(
        storage.removeReplacedProfileImage(
          `${CLOUDFRONT_ORIGIN}profile-images/tests/00000000-0000-0000-0000-000000000000.jpg`,
        ),
      ).resolves.toBeUndefined();
      // 원본이 S3에 남아 있으면 무효화해도 다시 캐시되므로 요청하지 않습니다.
      expect(invalidateCloudFrontObject).not.toHaveBeenCalled();
    });
  });
});
