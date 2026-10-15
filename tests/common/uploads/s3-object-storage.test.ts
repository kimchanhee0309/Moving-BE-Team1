/**
 * S3 객체 저장 경계가 비공개 버킷에 올바른 요청을 보내고 CloudFront URL과 key를 정확히 변환하는지,
 * 그리고 삭제한 객체의 CloudFront 캐시 무효화를 올바른 배포·경로로 요청하는지 검증합니다.
 * 실제 AWS에는 접속하지 않고 SDK client의 send 경계를 mock하며 테스트 전용 버킷·도메인·배포 ID 값만 사용합니다.
 */
const mockSend = jest.fn();
const mockCloudFrontSend = jest.fn();

jest.mock("@aws-sdk/client-cloudfront", () => ({
  CloudFrontClient: jest.fn(() => ({ send: mockCloudFrontSend })),
  CreateInvalidationCommand: jest.fn((input: unknown) => ({ type: "invalidate", input })),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn((input: unknown) => ({ type: "put", input })),
  DeleteObjectCommand: jest.fn((input: unknown) => ({ type: "delete", input })),
}));

import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import { S3Client } from "@aws-sdk/client-s3";

import {
  deleteS3Object,
  findCloudFrontObjectKey,
  getCloudFrontUrl,
  invalidateCloudFrontObject,
  putS3Object,
} from "../../../src/common/uploads/s3-object-storage";
import { env } from "../../../src/config/env";

const KEY = "profile-images/customers/00000000-0000-0000-0000-000000000000.jpg";

describe("S3 object storage", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockCloudFrontSend.mockReset();
    jest.replaceProperty(env, "AWS_BUCKET_NAME", "moving-test-bucket");
    jest.replaceProperty(env, "CLOUDFRONT_DOMAIN", "d111111abcdef8.cloudfront.net");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("key를 CloudFront HTTPS URL로 바꾸고 같은 배포의 URL에서만 key를 되찾는다", () => {
    const url = getCloudFrontUrl(KEY);

    expect(url).toBe(`https://d111111abcdef8.cloudfront.net/${KEY}`);
    expect(findCloudFrontObjectKey(url)).toBe(KEY);
    // 다른 도메인, 도메인 앞부분만 같은 주소, 상대 경로는 우리 버킷의 객체가 아닙니다.
    expect(findCloudFrontObjectKey(`https://cdn.example.com/${KEY}`)).toBeNull();
    expect(
      findCloudFrontObjectKey(`https://d111111abcdef8.cloudfront.net.evil.example/${KEY}`),
    ).toBeNull();
    expect(findCloudFrontObjectKey("/uploads/customer-profiles/a.jpg")).toBeNull();
  });

  test("객체를 ACL 없이 설정된 버킷에 올리고 CloudFront는 길게 브라우저는 짧게 캐시하도록 지정한다", async () => {
    mockSend.mockResolvedValue({});
    const body = Buffer.from("image-bytes");

    await putS3Object({ key: KEY, body, contentType: "image/jpeg" });

    expect(S3Client).toHaveBeenCalledWith({ region: env.AWS_REGION });
    expect(mockSend).toHaveBeenCalledWith({
      type: "put",
      input: {
        Bucket: "moving-test-bucket",
        Key: KEY,
        Body: body,
        ContentType: "image/jpeg",
        // 기대 결과: 무효화로 지울 수 없는 브라우저 캐시는 1시간, CloudFront 캐시는 1년입니다.
        CacheControl: "public, max-age=3600, s-maxage=31536000",
      },
    });
  });

  test("객체 삭제는 설정된 버킷과 key만 전달한다", async () => {
    mockSend.mockResolvedValue({});

    await deleteS3Object(KEY);

    expect(mockSend).toHaveBeenCalledWith({
      type: "delete",
      input: { Bucket: "moving-test-bucket", Key: KEY },
    });
  });

  test("배포 ID가 있으면 객체 경로 하나만 담은 캐시 무효화를 요청한다", async () => {
    jest.replaceProperty(env, "CLOUDFRONT_DISTRIBUTION_ID", "E1ABCDEFGHIJKL");
    mockCloudFrontSend.mockResolvedValue({});

    await expect(invalidateCloudFrontObject(KEY)).resolves.toBe(true);
    await expect(invalidateCloudFrontObject(KEY)).resolves.toBe(true);

    expect(CloudFrontClient).toHaveBeenCalledWith({ region: env.AWS_REGION });
    expect(mockCloudFrontSend).toHaveBeenCalledTimes(2);
    expect(mockCloudFrontSend).toHaveBeenNthCalledWith(1, {
      type: "invalidate",
      input: {
        DistributionId: "E1ABCDEFGHIJKL",
        InvalidationBatch: {
          CallerReference: expect.any(String),
          // 기대 결과: CloudFront 경로는 S3 key 앞에 /를 붙인 값이며 와일드카드를 쓰지 않습니다.
          Paths: { Quantity: 1, Items: [`/${KEY}`] },
        },
      },
    });
    // 같은 key를 다시 무효화해도 중복 요청으로 무시되지 않도록 CallerReference가 매번 달라야 합니다.
    const callerReferences = mockCloudFrontSend.mock.calls.map(
      ([command]: [{ input: { InvalidationBatch: { CallerReference: string } } }]) =>
        command.input.InvalidationBatch.CallerReference,
    );
    expect(new Set(callerReferences).size).toBe(2);
  });

  test("배포 ID가 없으면 AWS를 호출하지 않고 무효화를 건너뛴다", async () => {
    jest.replaceProperty(env, "CLOUDFRONT_DISTRIBUTION_ID", undefined);

    await expect(invalidateCloudFrontObject(KEY)).resolves.toBe(false);

    expect(mockCloudFrontSend).not.toHaveBeenCalled();
  });

  test("무효화 요청이 실패하면 호출부가 처리하도록 오류를 그대로 전달한다", async () => {
    jest.replaceProperty(env, "CLOUDFRONT_DISTRIBUTION_ID", "E1ABCDEFGHIJKL");
    mockCloudFrontSend.mockRejectedValue(new Error("AccessDenied"));

    await expect(invalidateCloudFrontObject(KEY)).rejects.toThrow("AccessDenied");
  });

  test("버킷이나 CloudFront 도메인이 없으면 AWS를 호출하지 않고 IMAGE_STORAGE_NOT_CONFIGURED(503)로 중단한다", async () => {
    jest.replaceProperty(env, "AWS_BUCKET_NAME", undefined);
    const notConfigured = expect.objectContaining({
      status: 503,
      code: "IMAGE_STORAGE_NOT_CONFIGURED",
    });

    expect(() => getCloudFrontUrl(KEY)).toThrow(notConfigured);
    await expect(
      putS3Object({ key: KEY, body: Buffer.from("x"), contentType: "image/jpeg" }),
    ).rejects.toEqual(notConfigured);
    await expect(deleteS3Object(KEY)).rejects.toEqual(notConfigured);
    // 설정이 없으면 어떤 URL도 삭제 대상 key로 해석하지 않습니다.
    expect(
      findCloudFrontObjectKey(`https://d111111abcdef8.cloudfront.net/${KEY}`),
    ).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
