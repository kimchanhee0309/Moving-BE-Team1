/**
 * Customer Profile 이미지가 확장자 문자열이 아니라 실제 JPEG·PNG·WebP 디코딩으로 검증되는지,
 * 그리고 Customer 전용 S3 key prefix로 저장되는지 확인합니다.
 * 실제 AWS와 서버 디스크는 사용하지 않고 S3 객체 저장 경계를 mock합니다.
 */
jest.mock("../../src/common/uploads/s3-object-storage", () => ({
  deleteS3Object: jest.fn(),
  findCloudFrontObjectKey: jest.fn(),
  getCloudFrontUrl: jest.fn((key: string) => `https://d111111abcdef8.cloudfront.net/${key}`),
  putS3Object: jest.fn(),
}));

import { Readable } from "node:stream";
import sharp from "sharp";

import { BadRequestError } from "../../src/common/errors/app-error";
import { putS3Object } from "../../src/common/uploads/s3-object-storage";
import { env } from "../../src/config/env";
import {
  saveUploadedProfileImage,
  validateUploadedProfileImage,
} from "../../src/modules/customer-profile/customer-profile.image";

function createMemoryFile(buffer: Buffer, mimeType: string): Express.Multer.File {
  return {
    fieldname: "profileImage",
    originalname: "profile",
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

describe("Customer Profile image", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("전체 디코딩 가능한 PNG를 허용하고 Customer 전용 key의 CloudFront URL로 저장한다", async () => {
    jest.replaceProperty(env, "PROFILE_IMAGE_STORAGE", "s3");
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 20, g: 40, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const file = createMemoryFile(png, "image/png");

    await expect(validateUploadedProfileImage(file)).resolves.toBeUndefined();
    await expect(saveUploadedProfileImage(file)).resolves.toMatch(
      /^https:\/\/d111111abcdef8\.cloudfront\.net\/profile-images\/customers\/[0-9a-f-]{36}\.png$/,
    );
    expect(putS3Object).toHaveBeenCalledWith(
      expect.objectContaining({ body: png, contentType: "image/png" }),
    );
  });

  test("MIME만 image/jpeg이고 실제 디코딩할 수 없는 파일을 거절한다", async () => {
    const file = createMemoryFile(Buffer.from("not-an-image"), "image/jpeg");

    await expect(validateUploadedProfileImage(file)).rejects.toBeInstanceOf(BadRequestError);
  });
});
