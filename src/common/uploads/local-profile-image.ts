/**
 * Customer와 Mover가 공유하는 로컬 프로필 이미지 저장 경계를 제공합니다.
 * 역할별 모듈이 전달한 저장 폴더와 공개 URL prefix만 사용하며 DB 저장과 정적 파일 공개는 담당하지 않습니다.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import type { RequestHandler } from "express";
import multer from "multer";

import { BadRequestError } from "../errors/app-error";

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** 역할별 로컬 저장소와 공개 URL 계약을 주입하는 설정입니다. */
export interface LocalProfileImageConfig {
  uploadDirectory: string;
  publicUrlPrefix: string;
  maxBytes: number;
  fieldName?: string;
}

/** 역할별 모듈이 Router·Controller·Service에서 사용하는 이미지 작업 묶음입니다. */
export interface LocalProfileImageStorage {
  uploadDirectory: string;
  publicUrlPrefix: string;
  uploadProfileImage: RequestHandler;
  validateUploadedProfileImage: (file?: Express.Multer.File) => Promise<void>;
  getUploadedProfileImageUrl: (file?: Express.Multer.File) => string | undefined;
  removeUploadedProfileImage: (file?: Express.Multer.File) => Promise<void>;
  removeReplacedLocalProfileImage: (imageUrl: string | null) => Promise<void>;
}

function normalizePublicUrlPrefix(prefix: string): string {
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * 역할별 설정으로 Multer 업로드·signature 검증·실패 정리·교체 정리 함수를 생성합니다.
 * 새 파일은 UUID 이름으로 저장하며 외부 URL과 소유하지 않은 로컬 파일은 삭제하지 않습니다.
 */
export function createLocalProfileImageStorage(
  config: LocalProfileImageConfig,
): LocalProfileImageStorage {
  const uploadDirectory = path.resolve(config.uploadDirectory);
  const publicUrlPrefix = normalizePublicUrlPrefix(config.publicUrlPrefix);
  const fieldName = config.fieldName ?? "profileImage";
  const maxMiB = config.maxBytes / (1024 * 1024);

  const storage = multer.diskStorage({
    destination: (_request, _file, callback) => {
      mkdir(uploadDirectory, { recursive: true })
        .then(() => callback(null, uploadDirectory))
        .catch((error: unknown) =>
          callback(
            error instanceof Error
              ? error
              : new Error("업로드 폴더를 만들 수 없습니다."),
            "",
          ),
        );
    },
    filename: (_request, file, callback) => {
      const extension = MIME_EXTENSION[file.mimetype];

      if (!extension) {
        callback(
          new BadRequestError("지원하지 않는 이미지 형식입니다.", "VALIDATION_ERROR"),
          "",
        );
        return;
      }

      // 원본 파일명은 경로 조작과 개인정보 노출 위험이 있어 UUID 파일명으로 교체합니다.
      callback(null, `${randomUUID()}${extension}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: config.maxBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!Object.hasOwn(MIME_EXTENSION, file.mimetype)) {
        callback(
          new BadRequestError(
            "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
            "VALIDATION_ERROR",
            [{ field: fieldName, reason: "지원하지 않는 이미지 형식입니다." }],
          ),
        );
        return;
      }

      callback(null, true);
    },
  });

  /** multipart/form-data에서 역할별 프로필 이미지 한 장을 제한 크기로 저장합니다. */
  const uploadProfileImage: RequestHandler = (request, response, next) => {
    if (!request.is("multipart/form-data")) {
      next(
        new BadRequestError(
          "multipart/form-data 형식이 필요합니다.",
          "VALIDATION_ERROR",
          [{ field: "content-type", reason: "multipart/form-data를 사용해 주세요." }],
        ),
      );
      return;
    }

    upload.single(fieldName)(request, response, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const reason =
          error.code === "LIMIT_FILE_SIZE"
            ? `프로필 이미지는 ${maxMiB} MiB 이하여야 합니다.`
            : "프로필 이미지 업로드 형식을 확인해 주세요.";
        next(
          new BadRequestError(
            "프로필 이미지 업로드에 실패했습니다.",
            "VALIDATION_ERROR",
            [{ field: fieldName, reason }],
          ),
        );
        return;
      }

      next(error);
    });
  };

  /** MIME 헤더 위조를 막기 위해 저장된 파일의 실제 signature를 확인합니다. */
  async function validateUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
    if (!file) return;

    const bytes = await readFile(file.path);

    if (!isExpectedSignature(file.mimetype, bytes)) {
      throw new BadRequestError("올바른 이미지 파일이 아닙니다.", "VALIDATION_ERROR", [
        { field: fieldName, reason: "파일 내용과 이미지 형식이 일치하지 않습니다." },
      ]);
    }
  }

  /** 저장된 UUID 파일명을 역할별 공개 상대 URL로 변환합니다. */
  function getUploadedProfileImageUrl(file?: Express.Multer.File): string | undefined {
    return file ? `${publicUrlPrefix}${file.filename}` : undefined;
  }

  /** 요청 처리에 실패한 신규 업로드를 삭제하며 이미 없는 파일은 성공으로 처리합니다. */
  async function removeUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
    if (!file) return;

    try {
      await unlink(file.path);
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  /** DB 반영 후 교체된 기존 로컬 이미지만 안전하게 삭제합니다. */
  async function removeReplacedLocalProfileImage(imageUrl: string | null): Promise<void> {
    if (!imageUrl?.startsWith(publicUrlPrefix)) return;

    const fileName = imageUrl.slice(publicUrlPrefix.length);
    const isOwnedFile = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(fileName);

    if (!isOwnedFile || path.basename(fileName) !== fileName) return;

    try {
      await unlink(path.join(uploadDirectory, fileName));
    } catch (error: unknown) {
      // DB 변경은 이미 완료되었으므로 정리 실패로 API 성공을 되돌리지 않습니다.
      if (!isMissingFileError(error)) return;
    }
  }

  return {
    uploadDirectory,
    publicUrlPrefix,
    uploadProfileImage,
    validateUploadedProfileImage,
    getUploadedProfileImageUrl,
    removeUploadedProfileImage,
    removeReplacedLocalProfileImage,
  };
}
