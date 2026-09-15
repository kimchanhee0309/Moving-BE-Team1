/**
 * Customer Profile 이미지가 확장자 문자열이 아니라 실제 JPEG·PNG·WebP signature로 검증되는지 확인합니다.
 * 임시 폴더만 사용하고 테스트 종료 후 생성 파일을 모두 제거합니다.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { BadRequestError } from "../../src/common/errors/app-error";
import {
  getUploadedProfileImageUrl,
  validateUploadedProfileImage,
} from "../../src/modules/customer-profile/customer-profile.image";

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

describe("Customer Profile image", () => {
  let temporaryDirectory = "";

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "customer-profile-"));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  test("PNG signature가 맞는 파일과 공개 상대 URL을 허용한다", async () => {
    const filePath = path.join(temporaryDirectory, "00000000-0000-0000-0000-000000000000.png");
    await writeFile(
      filePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const file = createMulterFile(filePath, "image/png");

    await expect(validateUploadedProfileImage(file)).resolves.toBeUndefined();
    expect(getUploadedProfileImageUrl(file)).toBe(
      "/uploads/customer-profiles/00000000-0000-0000-0000-000000000000.png",
    );
  });

  test("MIME만 image/jpeg이고 실제 signature가 다른 파일을 거절한다", async () => {
    const filePath = path.join(temporaryDirectory, "00000000-0000-0000-0000-000000000000.jpg");
    await writeFile(filePath, Buffer.from("not-an-image"));
    const file = createMulterFile(filePath, "image/jpeg");

    await expect(validateUploadedProfileImage(file)).rejects.toBeInstanceOf(BadRequestError);
  });
});
