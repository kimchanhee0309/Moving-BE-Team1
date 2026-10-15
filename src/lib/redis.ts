/**
 * Redis 공용 client, 별도 구독 연결, key 생성과 연결 lifecycle을 담당합니다.
 * env 설정에 따라 standalone Redis 또는 ElastiCache Cluster에 연결합니다.
 * import만으로 접속하지 않으며 서버 시작 또는 구독 모듈 초기화 시 연결합니다.
 * TTL·캐시·인증·알림 처리 등 도메인 정책은 각 기능 모듈이 담당합니다.
 */
import { Cluster, Redis } from "ioredis";
import type { RedisOptions } from "ioredis";

import { env } from "../config/env";

/** standalone과 Cluster가 공유하는 일반 명령 client 타입입니다. */
export type RedisClient = Redis | Cluster;

const CONNECT_TIMEOUT_MS = 3_000;
const COMMAND_TIMEOUT_MS = 2_000;
const STARTUP_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;

const managedClients = new Set<RedisClient>();
let isClosing = false;

/**
 * 현재 환경 설정으로 지연 연결 client를 생성하고 종료 관리 대상으로 등록합니다.
 * @returns 아직 접속하지 않은 Redis 또는 Cluster client
 * @remarks 인증정보는 URL에서 읽되 로그에 노출하지 않습니다.
 */
function createManagedClient(): RedisClient {
  const url = new URL(env.REDIS_URL);
  const usesTls = url.protocol === "rediss:";

  const commonOptions: RedisOptions = {
    connectTimeout: CONNECT_TIMEOUT_MS,
    commandTimeout: COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,

    // 응답을 받지 못한 쓰기 명령이 자동 재전송되는 것을 줄입니다.
    // 이 옵션만으로 exactly-once 실행을 보장하지는 않습니다.
    autoResendUnfulfilledCommands: false,

    // TLS 인증서 검증은 Node.js 기본값을 유지합니다.
    ...(usesTls ? { tls: {} } : {}),
  };

  let client: RedisClient;

  if (env.REDIS_MODE === "cluster") {
    client = new Cluster(
      [
        {
          host: url.hostname,
          port: url.port ? Number(url.port) : 6379,
        },
      ],
      {
        lazyConnect: true,
        enableOfflineQueue: false,

        // topology 발견 후 connectClient의 PING으로 통신을 확인합니다.
        // CLUSTER INFO를 이용한 추가 ready check는 사용하지 않습니다.
        enableReadyCheck: false,

        // 인증·nonce 등의 조회는 replica 지연을 피하기 위해 primary를 사용합니다.
        scaleReads: "master",

        slotsRefreshTimeout: 3_000,
        slotsRefreshInterval: 5_000,

        clusterRetryStrategy(attempt) {
          return Math.min(attempt * 200, 2_000);
        },

        // TLS 연결 시 hostname을 유지해 인증서 검증에 사용합니다.
        ...(usesTls
          ? {
              dnsLookup(
                hostname: string,
                callback: (
                  error: NodeJS.ErrnoException | null | undefined,
                  address: string,
                  family?: number,
                ) => void,
              ): void {
                callback(null, hostname);
              },
            }
          : {}),

        redisOptions: {
          ...commonOptions,
          ...(url.username
            ? { username: decodeURIComponent(url.username) }
            : {}),
          ...(url.password
            ? { password: decodeURIComponent(url.password) }
            : {}),
        },
      },
    );
  } else {
    client = new Redis(env.REDIS_URL, {
      ...commonOptions,
      lazyConnect: true,
      enableOfflineQueue: false,

      retryStrategy(attempt) {
        return Math.min(attempt * 200, 2_000);
      },
    });
  }

  // 연결 URL·비밀번호·오류 원문을 로그에 출력하지 않습니다.
  client.on("error", () => {
    console.error("Redis 연결 또는 통신 중 오류가 발생했습니다.");
  });

  managedClients.add(client);

  return client;
}

/**
 * 일반 명령에 사용하는 프로세스 공용 client입니다.
 * 기능 모듈은 요청마다 새 client를 만들지 않고 이 객체를 import합니다.
 * Pub/Sub 구독에는 createRedisSubscriber로 만든 별도 연결을 사용합니다.
 */
export const redis: RedisClient = createManagedClient();

/**
 * 제한시간 안에 비동기 작업이 완료되는지 확인합니다.
 * @param task 실행할 비동기 작업
 * @param timeoutMs 제한시간, 밀리초
 * @param message 시간초과 시 고정 오류 메시지
 * @returns 작업 결과
 * @throws 작업 실패 또는 제한시간 초과
 * @remarks 실제 연결 취소는 호출자가 disconnect로 처리합니다.
 */
async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), deadline]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

/**
 * 새 client의 연결과 PING 응답을 확인합니다.
 * @param client 아직 접속하지 않은 관리 대상 client
 * @returns 연결 확인 완료 Promise
 * @throws 연결 실패, 잘못된 PING 응답 또는 제한시간 초과
 * @remarks 실패 시 background 재연결을 중단합니다.
 */
async function connectClient(client: RedisClient): Promise<void> {
  try {
    await withTimeout(
      async () => {
        await client.connect();

        const result = await client.ping();

        if (result !== "PONG") {
          throw new Error("Redis PING 응답이 올바르지 않습니다.");
        }
      },
      STARTUP_TIMEOUT_MS,
      "Redis 연결 제한시간을 초과했습니다.",
    );
  } catch {
    client.disconnect();

    throw new Error("Redis 연결을 확인하지 못했습니다.");
  }
}

/**
 * 서버 시작 시 공용 Redis 연결을 확인합니다.
 * @returns 연결 확인 완료 Promise
 * @throws 연결 실패 또는 서버 종료 진행 중
 * @remarks server.ts에서 서버 시작 전에 한 번 호출합니다.
 */
export async function connectRedis(): Promise<void> {
  if (isClosing) {
    throw new Error("서버 종료 중에는 Redis에 연결할 수 없습니다.");
  }

  await connectClient(redis);
}

/**
 * Pub/Sub 구독 전용 연결을 생성하고 연결을 확인합니다.
 * @returns subscribe에 사용할 별도 client
 * @throws 연결 실패 또는 서버 종료 진행 중
 * @remarks 알림 모듈 초기화 때 호출하고 요청마다 생성하지 않습니다.
 * 서버 종료 시 closeRedis가 이 연결도 함께 정리합니다.
 */
export async function createRedisSubscriber(): Promise<RedisClient> {
  if (isClosing) {
    throw new Error("서버 종료 중에는 Redis 연결을 생성할 수 없습니다.");
  }

  const subscriber = createManagedClient();

  try {
    await connectClient(subscriber);
    return subscriber;
  } catch {
    subscriber.disconnect();
    managedClients.delete(subscriber);
    throw new Error("Redis 구독 연결을 확인하지 못했습니다.");
  }
}

/**
 * 하나의 client 연결을 제한시간 안에 종료합니다.
 * @param client 종료 대상 client
 * @returns 연결 정리 완료 Promise
 * @remarks ready 상태는 QUIT을 시도하고 장애·시간초과 시 강제로 끊습니다.
 */
async function closeClient(client: RedisClient): Promise<void> {
  if (client.status !== "ready") {
    client.disconnect();
    return;
  }

  try {
    await withTimeout(
      () => client.quit(),
      SHUTDOWN_TIMEOUT_MS,
      "Redis 종료 제한시간을 초과했습니다.",
    );
  } catch {
    console.warn("Redis 연결을 강제로 종료합니다.");
  } finally {
    client.disconnect();
  }
}

/**
 * 공용 client와 별도 구독 연결을 모두 정리합니다.
 * @returns 전체 연결 정리 완료 Promise
 * @remarks 종료 이후에는 새 구독 연결 생성을 허용하지 않습니다.
 */
export async function closeRedis(): Promise<void> {
  isClosing = true;

  await Promise.all([...managedClients].map((client) => closeClient(client)));

  managedClients.clear();
}

/**
 * key 구성 요소를 검증하고 구분자 충돌을 방지합니다.
 * @param parts 도메인·용도·식별자
 * @returns 인코딩한 key suffix
 * @throws 구성 요소 누락 또는 빈 문자열
 */
function encodeKeyParts(parts: string[]): string {
  if (parts.length === 0 || parts.some((part) => part.trim().length === 0)) {
    throw new Error("Redis key 구성 요소는 비어 있을 수 없습니다.");
  }

  return parts.map((part) => encodeURIComponent(part)).join(":");
}

/**
 * 프로젝트·환경 prefix가 포함된 일반 Redis key를 생성합니다.
 * @param parts 도메인·용도·식별자 순서의 문자열
 * @returns namespace가 포함된 key
 * @throws 구성 요소 누락 또는 빈 문자열
 * @remarks 이메일·비밀번호·token 원문을 key로 사용하지 않습니다.
 */
export function redisKey(...parts: string[]): string {
  return `${env.REDIS_KEY_PREFIX}:${encodeKeyParts(parts)}`;
}

/**
 * Cluster에서 여러 key를 같은 hash slot에 배치하는 key를 생성합니다.
 * @param slotId 함께 처리할 데이터의 공통 식별자
 * @param parts 도메인·용도·식별자
 * @returns Redis hash tag가 포함된 key
 * @throws slotId 또는 구성 요소 누락
 * @remarks 여러 key를 사용하는 Lua·transaction에서 같은 slotId를 사용합니다.
 */
export function redisTaggedKey(slotId: string, ...parts: string[]): string {
  if (slotId.trim().length === 0) {
    throw new Error("Redis slot 식별자는 비어 있을 수 없습니다.");
  }

  const tag = encodeURIComponent(`${env.REDIS_KEY_PREFIX}:${slotId}`);

  return `${env.REDIS_KEY_PREFIX}:{${tag}}:${encodeKeyParts(parts)}`;
}
