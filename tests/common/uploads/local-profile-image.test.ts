/**
 * 공통 로컬 프로필 이미지 저장소의 MIME·크기·signature·URL 소유권 경계를 검증합니다.
 * 임시 폴더만 사용하며 테스트 종료 후 생성 파일을 모두 제거합니다.
 */
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import type { Request, Response } from "express";

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

  test("PNG signature와 역할별 공개 URL prefix를 사용한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000000.png",
    );
    await writeFile(
      filePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const file = createMulterFile(filePath, "image/png");

    await expect(storage.validateUploadedProfileImage(file)).resolves.toBeUndefined();
    expect(storage.getUploadedProfileImageUrl(file)).toBe(
      "/uploads/test-profiles/00000000-0000-0000-0000-000000000000.png",
    );
  });

  test("MIME와 실제 signature가 다르면 거절한다", async () => {
    const filePath = path.join(
      temporaryDirectory,
      "00000000-0000-0000-0000-000000000000.jpg",
    );
    await writeFile(filePath, Buffer.from("not-image"));

    await expect(
      storage.validateUploadedProfileImage(createMulterFile(filePath, "image/jpeg")),
    ).rejects.toBeInstanceOf(BadRequestError);
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
