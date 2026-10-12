/**
 * Customer와 Mover가 공유하는 프로필 이미지 저장 경계를 제공합니다.
 * 처리 흐름: multer가 파일을 메모리로 받음 → 실제 이미지인지 전체 디코딩으로 검증 → 검증을 통과한 파일만 저장소에 저장.
 * 저장소는 PROFILE_IMAGE_STORAGE로 고릅니다. local은 서버 디스크와 상대 URL(/uploads/...), s3는 비공개 버킷과 CloudFront URL을 씁니다.
 * 역할별 모듈이 전달한 저장 폴더·URL prefix·S3 key prefix만 사용하며 DB 저장과 정적 파일 공개는 담당하지 않습니다.
 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RequestHandler } from "express";
import multer from "multer";
import sharp from "sharp";

import { env } from "../../config/env";
import { BadGatewayError, BadRequestError } from "../errors/app-error";
import {
  deleteS3Object,
  findCloudFrontObjectKey,
  getCloudFrontUrl,
  putS3Object,
} from "./s3-object-storage";

const MIME_EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const MIME_IMAGE_FORMAT: Readonly<Record<string, "jpeg" | "png" | "webp">> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

// 압축 해제 폭탄이 작은 업로드 파일로 과도한 메모리를 사용하지 못하게 실제 픽셀 수도 제한합니다.
const MAX_PROFILE_IMAGE_PIXELS = 40_000_000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
// 이 모듈이 만든 파일 이름(UUID + 허용 확장자)만 삭제 대상으로 인정합니다.
const OWNED_FILE_NAME_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

/** 역할별 저장 위치와 공개 URL 계약을 주입하는 설정입니다. */
export interface ProfileImageStorageConfig {
  /** local 저장소가 파일을 쓰는 서버 폴더입니다. */
  uploadDirectory: string;
  /** local 저장소의 공개 상대 URL prefix입니다. 예: /uploads/customer-profiles/ */
  publicUrlPrefix: string;
  /** s3 저장소의 객체 key prefix입니다. 예: profile-images/customers/ */
  s3KeyPrefix: string;
  /** 업로드 한 건의 최대 크기(byte)입니다. */
  maxBytes: number;
  fieldName?: string;
}

/** 역할별 모듈이 Router·Controller·Service에서 사용하는 이미지 작업 묶음입니다. */
export interface ProfileImageStorage {
  uploadDirectory: string;
  publicUrlPrefix: string;
  uploadProfileImage: RequestHandler;
  validateUploadedProfileImage: (file?: Express.Multer.File) => Promise<void>;
  saveUploadedProfileImage: (file?: Express.Multer.File) => Promise<string | undefined>;
  removeUploadedProfileImage: (file?: Express.Multer.File) => Promise<void>;
  removeReplacedProfileImage: (imageUrl: string | null) => Promise<void>;
}

function normalizePublicUrlPrefix(prefix: string): string {
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

/** S3 key는 /로 시작하지 않고 /로 끝나는 prefix를 사용합니다. */
function normalizeS3KeyPrefix(prefix: string): string {
  const withoutLeadingSlash = prefix.replace(/^\/+/, "");
  return withoutLeadingSlash.endsWith("/") ? withoutLeadingSlash : `${withoutLeadingSlash}/`;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function hasPngAnimationControlChunk(bytes: Buffer): boolean {
  if (
    bytes.length < PNG_SIGNATURE.length ||
    !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return false;
  }

  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataEnd = typeStart + 4 + dataLength;
    const chunkEnd = dataEnd + 4;

    if (chunkEnd > bytes.length) return false;

    const chunkType = bytes.subarray(typeStart, typeStart + 4).toString("ascii");
    if (chunkType === "acTL") return true;
    if (chunkType === "IEND") return false;

    offset = chunkEnd;
  }

  return false;
}

/**
 * 역할별 설정으로 업로드·이미지 검증·저장·실패 정리·교체 정리 함수를 생성합니다.
 * 새 파일은 UUID 이름으로 저장하며 외부 URL과 이 모듈이 만들지 않은 파일은 삭제하지 않습니다.
 */
export function createProfileImageStorage(
  config: ProfileImageStorageConfig,
): ProfileImageStorage {
  const uploadDirectory = path.resolve(config.uploadDirectory);
  const publicUrlPrefix = normalizePublicUrlPrefix(config.publicUrlPrefix);
  const s3KeyPrefix = normalizeS3KeyPrefix(config.s3KeyPrefix);
  const fieldName = config.fieldName ?? "profileImage";
  const maxMiB = config.maxBytes / (1024 * 1024);
  // 실패한 요청의 신규 업로드를 정리할 수 있도록 요청 파일과 저장한 URL을 연결해 둡니다.
  // 요청이 끝나 파일 객체가 수거되면 항목도 함께 사라집니다.
  const savedImageUrls = new WeakMap<Express.Multer.File, string>();

  // 검증 전에는 디스크나 S3에 아무것도 남기지 않도록 메모리로만 받습니다. 크기는 역할별 maxBytes로 제한합니다.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!Object.hasOwn(MIME_EXTENSION, file.mimetype)) {
        callback(
          new BadRequestError(
            "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.",
            "VALIDATION_ERROR",
            [{ field: fieldName, reason: "지원하지 않는 이미지 형식입니다.", code: "UNSUPPORTED_IMAGE_TYPE" }],
          ),
        );
        return;
      }

      callback(null, true);
    },
  });

  /** multipart/form-data에서 역할별 프로필 이미지 한 장을 제한 크기로 메모리에 받습니다. */
  const uploadProfileImage: RequestHandler = (request, response, next) => {
    if (!request.is("multipart/form-data")) {
      next(
        new BadRequestError(
          "multipart/form-data 형식이 필요합니다.",
          "VALIDATION_ERROR",
          [{ field: "content-type", reason: "multipart/form-data를 사용해 주세요.", code: "INVALID_CONTENT_TYPE" }],
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

  /** 전체 파일을 디코딩해 MIME 위조·손상·애니메이션 이미지와 압축 해제 폭탄을 거절합니다. */
  async function validateUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
    if (!file) return;

    const expectedFormat = MIME_IMAGE_FORMAT[file.mimetype];

    if (!expectedFormat) {
      throw new BadRequestError(
        "올바른 이미지 파일이 아닙니다.",
        "VALIDATION_ERROR",
        [{ field: fieldName, reason: "지원하지 않는 이미지 형식입니다.", code: "UNSUPPORTED_IMAGE_TYPE" }],
      );
    }

    try {
      const imageBytes = file.buffer;

      if (expectedFormat === "png" && hasPngAnimationControlChunk(imageBytes)) {
        throw new BadRequestError(
          "애니메이션 이미지는 업로드할 수 없습니다.",
          "VALIDATION_ERROR",
          [{ field: fieldName, reason: "정지 이미지만 업로드할 수 있습니다.", code: "ANIMATED_IMAGE_NOT_ALLOWED" }],
        );
      }

      const metadata = await sharp(imageBytes, {
        animated: true,
        failOn: "error",
        limitInputPixels: MAX_PROFILE_IMAGE_PIXELS,
      }).metadata();

      if (metadata.format !== expectedFormat) {
        throw new BadRequestError(
          "올바른 이미지 파일이 아닙니다.",
          "VALIDATION_ERROR",
          [{ field: fieldName, reason: "파일 내용과 이미지 형식이 일치하지 않습니다.", code: "IMAGE_TYPE_MISMATCH" }],
        );
      }

      if ((metadata.pages ?? 1) > 1) {
        throw new BadRequestError(
          "애니메이션 이미지는 업로드할 수 없습니다.",
          "VALIDATION_ERROR",
          [{ field: fieldName, reason: "정지 이미지만 업로드할 수 있습니다.", code: "ANIMATED_IMAGE_NOT_ALLOWED" }],
        );
      }

      // metadata만 읽으면 잘린 픽셀 데이터가 남을 수 있으므로 전체 픽셀을 실제로 디코딩합니다.
      await sharp(imageBytes, {
        failOn: "error",
        limitInputPixels: MAX_PROFILE_IMAGE_PIXELS,
      })
        .raw()
        .toBuffer();
    } catch (error: unknown) {
      if (error instanceof BadRequestError) throw error;

      throw new BadRequestError(
        "올바른 이미지 파일이 아닙니다.",
        "VALIDATION_ERROR",
        [{ field: fieldName, reason: "손상되지 않은 정지 이미지를 업로드해 주세요.", code: "CORRUPTED_IMAGE" }],
      );
    }
  }

  /**
   * 검증을 통과한 파일을 현재 저장소에 UUID 이름으로 저장하고 DB에 넣을 URL을 반환합니다.
   * @param file validateUploadedProfileImage를 통과한 multer 메모리 파일이며 없으면 저장하지 않습니다
   * @returns local은 /uploads/... 상대 URL, s3는 https://{CloudFront 도메인}/... URL, 파일이 없으면 undefined
   * @throws 지원하지 않는 MIME은 VALIDATION_ERROR, S3 저장 실패는 PROFILE_IMAGE_UPLOAD_FAILED(502)
   * @remarks 반드시 검증 뒤에 호출합니다. 원본 파일명은 경로 조작과 개인정보 노출 위험이 있어 사용하지 않습니다.
   */
  async function saveUploadedProfileImage(
    file?: Express.Multer.File,
  ): Promise<string | undefined> {
    if (!file) return undefined;

    const extension = MIME_EXTENSION[file.mimetype];

    if (!extension) {
      throw new BadRequestError("지원하지 않는 이미지 형식입니다.", "VALIDATION_ERROR");
    }

    const fileName = `${randomUUID()}${extension}`;
    let imageUrl: string;

    if (env.PROFILE_IMAGE_STORAGE === "s3") {
      const key = `${s3KeyPrefix}${fileName}`;
      // URL을 먼저 만들어 설정 누락을 업로드 전에 드러냅니다.
      imageUrl = getCloudFrontUrl(key);

      try {
        await putS3Object({ key, body: file.buffer, contentType: file.mimetype });
      } catch {
        // AWS 오류 원문에는 버킷·요청 ID 등이 포함될 수 있어 응답에 노출하지 않습니다.
        throw new BadGatewayError(
          "프로필 이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          "PROFILE_IMAGE_UPLOAD_FAILED",
        );
      }
    } else {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(path.join(uploadDirectory, fileName), file.buffer);
      imageUrl = `${publicUrlPrefix}${fileName}`;
    }

    savedImageUrls.set(file, imageUrl);
    return imageUrl;
  }

  /**
   * 이 모듈이 만든 이미지 URL이 가리키는 파일 한 건을 삭제합니다.
   * 저장소 설정이 바뀐 뒤에도 이전 방식의 이미지를 정리할 수 있도록 현재 설정이 아니라 URL 모양으로 저장 위치를 판정합니다.
   * 외부 URL, 다른 역할의 prefix, UUID 이름이 아닌 경로는 소유하지 않은 것으로 보고 건드리지 않습니다.
   */
  async function removeStoredProfileImage(imageUrl: string): Promise<void> {
    if (imageUrl.startsWith(publicUrlPrefix)) {
      const fileName = imageUrl.slice(publicUrlPrefix.length);

      if (!OWNED_FILE_NAME_PATTERN.test(fileName) || path.basename(fileName) !== fileName) return;

      try {
        await unlink(path.join(uploadDirectory, fileName));
      } catch (error: unknown) {
        if (!isMissingFileError(error)) throw error;
      }
      return;
    }

    const key = findCloudFrontObjectKey(imageUrl);

    if (
      !key?.startsWith(s3KeyPrefix) ||
      !OWNED_FILE_NAME_PATTERN.test(key.slice(s3KeyPrefix.length))
    ) {
      return;
    }

    await deleteS3Object(key);
  }

  /** 요청 처리에 실패한 신규 업로드를 삭제하며 저장 전이거나 이미 없는 파일은 성공으로 처리합니다. */
  async function removeUploadedProfileImage(file?: Express.Multer.File): Promise<void> {
    if (!file) return;

    const imageUrl = savedImageUrls.get(file);
    if (!imageUrl) return;

    await removeStoredProfileImage(imageUrl);
    savedImageUrls.delete(file);
  }

  /** DB 반영 후 교체되거나 더는 쓰지 않는 기존 이미지를 삭제합니다. */
  async function removeReplacedProfileImage(imageUrl: string | null): Promise<void> {
    if (!imageUrl) return;

    try {
      await removeStoredProfileImage(imageUrl);
    } catch {
      // DB 변경은 이미 완료되었으므로 정리 실패로 API 성공을 되돌리지 않습니다.
    }
  }

  return {
    uploadDirectory,
    publicUrlPrefix,
    uploadProfileImage,
    validateUploadedProfileImage,
    saveUploadedProfileImage,
    removeUploadedProfileImage,
    removeReplacedProfileImage,
  };
}
