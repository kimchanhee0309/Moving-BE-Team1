/**
 * 프로필 이미지 저장소 환경변수가 서버 시작 단계에서 검증되는지 확인합니다.
 * env 모듈은 import 시점에 한 번 평가되므로 시나리오마다 모듈 캐시를 비우고 process.env를 바꿔 다시 불러옵니다.
 * 테스트 전용 버킷·도메인 값만 사용하며 실제 AWS에는 접속하지 않습니다.
 */
import type { env as loadedEnv } from "../../src/config/env";

interface EnvModule {
  env: typeof loadedEnv;
}

const IMAGE_ENV_KEYS = [
  "PROFILE_IMAGE_STORAGE",
  "AWS_REGION",
  "AWS_BUCKET_NAME",
  "CLOUDFRONT_DOMAIN",
] as const;

function loadEnv(overrides: Partial<Record<(typeof IMAGE_ENV_KEYS)[number], string>>) {
  for (const key of IMAGE_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);

  let loaded: EnvModule | undefined;
  jest.isolateModules(() => {
    // 시나리오마다 새로 평가해야 하므로 정적 import 대신 격리된 require를 사용합니다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("../../src/config/env") as EnvModule;
  });

  if (!loaded) throw new Error("env 모듈을 불러오지 못했습니다.");
  return loaded.env;
}

describe("Profile image storage env", () => {
  const originalValues = new Map(IMAGE_ENV_KEYS.map((key) => [key, process.env[key]]));

  afterAll(() => {
    for (const [key, value] of originalValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("설정이 없으면 AWS 값 없이 local 저장소와 서울 리전을 기본값으로 쓴다", () => {
    const env = loadEnv({});

    expect(env.PROFILE_IMAGE_STORAGE).toBe("local");
    expect(env.AWS_REGION).toBe("ap-northeast-2");
    expect(env.AWS_BUCKET_NAME).toBeUndefined();
    expect(env.CLOUDFRONT_DOMAIN).toBeUndefined();
  });

  test("s3 저장소는 버킷과 CloudFront 도메인이 모두 있어야 시작한다", () => {
    expect(() => loadEnv({ PROFILE_IMAGE_STORAGE: "s3" })).toThrow(
      "PROFILE_IMAGE_STORAGE=s3에는 AWS_BUCKET_NAME과 CLOUDFRONT_DOMAIN이 필요합니다.",
    );
    expect(() =>
      loadEnv({ PROFILE_IMAGE_STORAGE: "s3", AWS_BUCKET_NAME: "moving-test-bucket" }),
    ).toThrow("AWS_BUCKET_NAME과 CLOUDFRONT_DOMAIN이 필요합니다.");

    const env = loadEnv({
      PROFILE_IMAGE_STORAGE: " S3 ",
      AWS_BUCKET_NAME: "moving-test-bucket",
      CLOUDFRONT_DOMAIN: "D111111ABCDEF8.cloudfront.net",
      AWS_REGION: "us-east-1",
    });

    expect(env.PROFILE_IMAGE_STORAGE).toBe("s3");
    expect(env.AWS_BUCKET_NAME).toBe("moving-test-bucket");
    // 기대 결과: URL 비교가 어긋나지 않도록 도메인을 소문자로 정규화합니다.
    expect(env.CLOUDFRONT_DOMAIN).toBe("d111111abcdef8.cloudfront.net");
    expect(env.AWS_REGION).toBe("us-east-1");
  });

  test("알 수 없는 저장소 이름과 scheme·경로가 섞인 CloudFront 도메인을 거절한다", () => {
    expect(() => loadEnv({ PROFILE_IMAGE_STORAGE: "gcs" })).toThrow(
      "PROFILE_IMAGE_STORAGE는 local 또는 s3여야 합니다.",
    );

    for (const domain of [
      "https://d111111abcdef8.cloudfront.net",
      "d111111abcdef8.cloudfront.net/",
      "d111111abcdef8.cloudfront.net/images",
      "localhost",
    ]) {
      expect(() => loadEnv({ CLOUDFRONT_DOMAIN: domain })).toThrow(
        "CLOUDFRONT_DOMAIN에는 https://와 경로를 뺀 도메인만 설정해야 합니다.",
      );
    }
  });
});
