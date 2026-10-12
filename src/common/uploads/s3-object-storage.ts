/**
 * 비공개 S3 버킷에 객체를 저장·삭제하고, 그 객체를 공개하는 CloudFront URL과 S3 key를 서로 변환합니다.
 * 처리 흐름: 서버가 S3 API로 직접 올리고 지우며, 브라우저는 CloudFront 주소로만 읽습니다(버킷은 OAC로 CloudFront에만 열려 있음).
 * 파일 검증, key 이름 규칙, DB 저장은 호출하는 이미지 저장소 모듈이 담당합니다.
 * AWS 자격 증명은 SDK 기본 체인(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY 환경변수 또는 EC2 IAM Role)에서 읽으며 코드·로그에 남기지 않습니다.
 */
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { ServiceUnavailableError } from "../errors/app-error";
import { env } from "../../config/env";

/** S3에 저장할 객체 한 건입니다. */
export interface PutS3ObjectInput {
  /** 버킷 안의 객체 경로입니다. 앞에 /를 붙이지 않습니다. */
  key: string;
  body: Buffer;
  /** 브라우저가 이미지로 해석하도록 응답에 실릴 MIME type입니다. */
  contentType: string;
}

// UUID key는 덮어쓰지 않으므로 브라우저와 CloudFront가 1년간 캐시해도 오래된 이미지가 보이지 않습니다.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

let s3Client: S3Client | null = null;

interface S3Configuration {
  bucket: string;
  cloudFrontDomain: string;
}

function findS3Configuration(): S3Configuration | null {
  if (!env.AWS_BUCKET_NAME || !env.CLOUDFRONT_DOMAIN) return null;

  return { bucket: env.AWS_BUCKET_NAME, cloudFrontDomain: env.CLOUDFRONT_DOMAIN };
}

function getS3Configuration(): S3Configuration {
  const configuration = findS3Configuration();

  if (!configuration) {
    throw new ServiceUnavailableError(
      "이미지 저장소 설정이 필요합니다.",
      "IMAGE_STORAGE_NOT_CONFIGURED",
    );
  }

  return configuration;
}

function getS3Client(): S3Client {
  // local 저장소만 쓰는 환경에서 불필요한 client를 만들지 않도록 첫 사용 때 생성합니다.
  s3Client ??= new S3Client({ region: env.AWS_REGION });
  return s3Client;
}

/**
 * S3 key를 브라우저가 접근할 CloudFront URL로 변환합니다.
 * @param key 버킷 안의 객체 경로
 * @returns DB에 저장하고 응답으로 내려 줄 HTTPS URL
 * @throws 버킷 또는 CloudFront 도메인 미설정 시 IMAGE_STORAGE_NOT_CONFIGURED
 */
export function getCloudFrontUrl(key: string): string {
  return `https://${getS3Configuration().cloudFrontDomain}/${key}`;
}

/**
 * 이 서버의 CloudFront 배포를 가리키는 URL에서 S3 key를 꺼냅니다.
 * @param url DB에 저장된 이미지 URL
 * @returns S3 key이며, 다른 도메인의 URL·상대 경로이거나 S3 설정이 없으면 null
 * @remarks 삭제 대상이 우리 버킷의 객체인지 판정하는 데 쓰며 외부 URL을 삭제 대상으로 오인하지 않게 합니다.
 */
export function findCloudFrontObjectKey(url: string): string | null {
  const configuration = findS3Configuration();
  if (!configuration) return null;

  const prefix = `https://${configuration.cloudFrontDomain}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/**
 * 객체 한 건을 비공개 버킷에 저장합니다.
 * @param input key, 본문, MIME type
 * @returns 저장 완료 Promise
 * @throws 설정 누락 시 IMAGE_STORAGE_NOT_CONFIGURED, AWS 요청 실패 시 SDK 오류
 * @remarks ACL을 지정하지 않으므로 객체는 비공개이며 CloudFront OAC를 통해서만 읽을 수 있습니다.
 */
export async function putS3Object(input: PutS3ObjectInput): Promise<void> {
  const { bucket } = getS3Configuration();

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }),
  );
}

/**
 * 객체 한 건을 버킷에서 삭제합니다.
 * @param key 버킷 안의 객체 경로
 * @returns 삭제 완료 Promise이며 이미 없는 객체도 S3가 성공으로 응답합니다
 * @throws 설정 누락 시 IMAGE_STORAGE_NOT_CONFIGURED, AWS 요청 실패 시 SDK 오류
 * @remarks CloudFront에 캐시된 사본은 캐시 만료까지 남을 수 있습니다.
 */
export async function deleteS3Object(key: string): Promise<void> {
  const { bucket } = getS3Configuration();

  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
