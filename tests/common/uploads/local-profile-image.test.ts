/**
 * 공통 로컬 프로필 이미지 저장소의 MIME·크기·전체 디코딩·URL 소유권 경계를 검증합니다.
 * 임시 폴더만 사용하며 테스트 종료 후 생성 파일을 모두 제거합니다.
 */
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import type { Request, Response } from "express";
import sharp from "sharp";

import { BadRequestError } from "../../../src/common/errors/app-error";
import {
  createLocalProfileImageStorage,
  type LocalProfileImageStorage,
} from "../../../src/common/uploads/local-profile-image";

function createMulterFile(filePath: string, mimeType: string): Express.Multer.File {
  const fileName = path.basename(filePath);

  return {
    fieldname: "profileImage",
    originalname: fileName,
    encoding: "7bit",
    mimetype: mimeType,
    size: 12,
    destination: path.dirname(filePath),
    filename: fileName,
    path: filePath,
    buffer: Buffer.alloc(0),
    stream: Readable.from([]),
  };
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
  storage: LocalProfileImageStorage,
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

describe("Local profile image storage", () => {
  let temporaryDirectory = "";
  let storage: LocalProfileImageStorage;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "profile-image-"));
    storage = createLocalProfileImageStorage({
      uploadDirectory: temporaryDirectory,
      publicUrlPrefix: "/uploads/test-profiles/",
      maxBytes: 8,
    });
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test("전체 디코딩 가능한 정적 PNG와 역할별 공개 URL prefix를 승인한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000000.png",
    );
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 1 },
      },
    })
      .png()
      .toFile(filePath);
    const file = createMulterFile(filePath, "image/png");

    await expect(storage.validateUploadedProfileImage(file)).resolves.toBeUndefined();
    expect(storage.getUploadedProfileImageUrl(file)).toBe(
      "/uploads/test-profiles/00000000-0000-0000-0000-000000000000.png",
    );
  });

  test("MIME와 실제 디코딩 format이 다르면 거절한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000000.jpg",
    );
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toFile(filePath);

    await expect(
      storage.validateUploadedProfileImage(createMulterFile(filePath, "image/jpeg")),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("정상 헤더만 남은 잘린 PNG와 손상된 JPEG를 거절한다", async () => {
    const truncatedPngPath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000001.png",
    );
    const corruptedJpegPath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000002.jpg",
    );
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

    await writeFile(
      truncatedPngPath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await writeFile(corruptedJpegPath, jpeg.subarray(0, jpeg.length - 10));

    await expect(
      storage.validateUploadedProfileImage(
        createMulterFile(truncatedPngPath, "image/png"),
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      storage.validateUploadedProfileImage(
        createMulterFile(corruptedJpegPath, "image/jpeg"),
      ),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("여러 프레임을 가진 animated WebP를 거절한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000003.webp",
    );
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

    await sharp(frames, { join: { animated: true } })
      .webp({ delay: [100, 100], loop: 0 })
      .toFile(filePath);

    await expect(
      storage.validateUploadedProfileImage(
        createMulterFile(filePath, "image/webp"),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("APNG animation control chunk가 있는 PNG를 거절한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000004.png",
    );
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const firstChunkEnd = 8 + 4 + 4 + png.readUInt32BE(8) + 4;
    const animationControlChunk = Buffer.alloc(20);
    animationControlChunk.writeUInt32BE(8, 0);
    animationControlChunk.write("acTL", 4, "ascii");
    animationControlChunk.writeUInt32BE(1, 8);
    animationControlChunk.writeUInt32BE(0, 12);

    await writeFile(
      filePath,
      Buffer.concat([
        png.subarray(0, firstChunkEnd),
        animationControlChunk,
        png.subarray(firstChunkEnd),
      ]),
    );

    await expect(
      storage.validateUploadedProfileImage(
        createMulterFile(filePath, "image/png"),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "애니메이션 이미지는 업로드할 수 없습니다.",
    });
  });

  test("허용하지 않은 MIME와 최대 크기 초과 업로드를 VALIDATION_ERROR로 변환한다", async () => {
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
  });

  test("소유한 UUID URL만 교체 정리하고 외부 URL은 보존한다", async () => {
    const ownedFileName = "00000000-0000-0000-0000-000000000000.webp";
    const ownedPath = path.join(temporaryDirectory, ownedFileName);
    await writeFile(ownedPath, Buffer.from("old"));

    await storage.removeReplacedLocalProfileImage("https://cdn.example.com/profile.webp");
    await expect(access(ownedPath)).resolves.toBeUndefined();

    await storage.removeReplacedLocalProfileImage(
      `/uploads/test-profiles/${ownedFileName}`,
    );
    await expect(access(ownedPath)).rejects.toThrow();
  });
});
