/**
 * Customer Profile 전용 이미지 업로드를 로컬 디스크에 격리합니다.
 * 현재 개발 단계의 multer 저장만 담당하며 배포 환경의 S3 업로드·삭제 정책은 담당하지 않습니다.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { RequestHandler } from "express";
import multer from "multer";

import { BadRequestError } from "../../common/errors/app-error";
import { CUSTOMER_PROFILE_IMAGE_MAX_BYTES } from "./customer-profile.constants";

/** 개발 서버가 정적 제공하는 프로필 이미지의 실제 저장 폴더입니다. */
export const CUSTOMER_PROFILE_UPLOAD_DIRECTORY = path.resolve(
  process.cwd(),
  "uploads",
  "customer-profiles",
);

const PROFILE_IMAGE_PUBLIC_PREFIX = "/uploads/customer-profiles/";
const MIME_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    mkdir(CUSTOMER_PROFILE_UPLOAD_DIRECTORY, { recursive: true })
      .then(() => callback(null, CUSTOMER_PROFILE_UPLOAD_DIRECTORY))
      .catch((error: unknown) =>
        callback(error instanceof Error ? error : new Error("업로드 폴더를 만들 수 없습니다."), ""),
      );
  },
  filename: (_request, file, callback) => {
    const extension = MIME_EXTENSION[file.mimetype];

    if (!extension) {
      callback(new BadRequestError("지원하지 않는 이미지 형식입니다.", "VALIDATION_ERROR"), "");
      return;
    }

    // 원본 파일명은 경로 조작과 개인정보 노출 위험이 있어 UUID 파일명으로 교체합니다.
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: CUSTOMER_PROFILE_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!Object.hasOwn(MIME_EXTENSION, file.mimetype)) {
      callback(
        new BadRequestError("JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.", "VALIDATION_ERROR", [
          { field: "profileImage", reason: "지원하지 않는 이미지 형식입니다." },
        ]),
      );
      return;
    }

    callback(null, true);
  },
});

function isExpectedSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  return (
    mimeType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/**
 * multipart/form-data에서 profileImage 한 장을 최대 5 MiB로 저장합니다.
 * 파일이 저장되는 부수 효과가 있으며 이후 검증·DB 실패 시 Controller가 반드시 정리해야 합니다.
 */
export const uploadCustomerProfileImage: RequestHandler = (request, response, next) => {
  if (!request.is("multipart/form-data")) {
    next(
      new BadRequestError("multipart/form-data 형식이 필요합니다.", "VALIDATION_ERROR", [
        { field: "content-type", reason: "multipart/form-data를 사용해 주세요." },
      ]),
    );
    return;
  }

  upload.single("profileImage")(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const reason =
        error.code === "LIMIT_FILE_SIZE"
          ? "프로필 이미지는 5 MiB 이하여야 합니다."
          : "프로필 이미지 업로드 형식을 확인해 주세요.";
      next(new BadRequestError("프로필 이미지 업로드에 실패했습니다.", "VALIDATION_ERROR", [
        { field: "profileImage", reason },
      ]));
      return;
    }

    next(error);
  });
};

/** MIME 헤더 위조를 막기 위해 저장된 파일의 실제 signature가 JPEG·PNG·WebP인지 확인합니다. */
export async function validateUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
  if (!file) return;

  const bytes = await readFile(file.path);

  if (!isExpectedSignature(file.mimetype, bytes)) {
    throw new BadRequestError("올바른 이미지 파일이 아닙니다.", "VALIDATION_ERROR", [
      { field: "profileImage", reason: "파일 내용과 이미지 형식이 일치하지 않습니다." },
    ]);
  }
}

/** 로컬 파일명을 외부에 저장할 상대 URL로 바꾸며 업로드가 없으면 undefined를 반환합니다. */
export function getUploadedProfileImageUrl(file?: Express.Multer.File): string | undefined {
  return file ? `${PROFILE_IMAGE_PUBLIC_PREFIX}${file.filename}` : undefined;
}

/** 요청 처리에 실패한 새 업로드 파일을 지우며 이미 없어진 파일은 오류로 확대하지 않습니다. */
export async function removeUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
  if (!file) return;

  try {
    await unlink(file.path);
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

/**
 * DB 수정 완료 후 교체된 이전 로컬 이미지를 정리합니다.
 * 현재 모듈이 만든 안전한 UUID 파일명만 삭제하며 외부 URL과 알 수 없는 경로는 건드리지 않습니다.
 */
export async function removeReplacedLocalProfileImage(imageUrl: string | null): Promise<void> {
  if (!imageUrl?.startsWith(PROFILE_IMAGE_PUBLIC_PREFIX)) return;

  const fileName = imageUrl.slice(PROFILE_IMAGE_PUBLIC_PREFIX.length);
  const isOwnedFile = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(fileName);

  if (!isOwnedFile) return;

  try {
    await unlink(path.join(CUSTOMER_PROFILE_UPLOAD_DIRECTORY, fileName));
  } catch (error: unknown) {
    // DB 변경은 이미 완료되었으므로 파일이 없거나 정리 실패한 경우 API 성공을 되돌리지 않습니다.
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      return;
    }
  }
}
