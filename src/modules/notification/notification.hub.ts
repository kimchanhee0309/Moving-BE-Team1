/**
 * SSE 연결을 프로세스 메모리에서 관리하는 허브입니다.
 * Redis 같은 공유 store 없이 단일 Node 프로세스 배포를 전제로 합니다(AGENTS.md 8번의 rate
 * limit/OAuth state 저장과 같은 전제). 다중 인스턴스로 확장할 때는 팀 승인 후 공유 store로
 * 교체해야 하며, 교체 전에는 모든 인스턴스에 연결된 클라이언트에 push된다고 보장하지 않습니다.
 *
 * 이 파일은 연결 등록·해제·push만 담당하고 인증·DB 조회·HTTP 응답 조립은 다루지 않습니다.
 * (인증은 notification.router.ts의 requireProfiledUser, 응답 조립은 notification.controller.ts)
 */
import type { Response } from "express";

import type { NotificationStreamPayload } from "./notification.dto";

/**
 * userId(User.id)별로 여러 연결(다른 탭·기기)을 Set으로 보관합니다.
 * Map<userId, Response> 처럼 사용자당 값 하나만 저장하면 두 번째 탭을 열 때 첫 번째 연결이
 * 덮어써져 그 탭은 이후 push를 전혀 받지 못하게 되므로 반드시 Set으로 여러 연결을 유지합니다.
 */
const connectionsByUserId = new Map<string, Set<Response>>();

/**
 * SSE 연결을 허브에 등록합니다.
 * @param userId 인증된 User.id
 * @param response 헤더가 이미 SSE로 설정되고 write가 가능한 Express Response
 * @sideeffect connectionsByUserId Map을 변경합니다.
 */
export function registerNotificationConnection(
  userId: string,
  response: Response,
): void {
  const existing = connectionsByUserId.get(userId);

  if (existing) {
    existing.add(response);
    return;
  }

  connectionsByUserId.set(userId, new Set([response]));
}

/**
 * 연결이 끊어졌을 때 허브에서 제거합니다.
 * 이미 등록되지 않은 연결이나 존재하지 않는 userId를 넘겨도 안전합니다.
 * 사용자의 마지막 연결이 사라지면 Map에서 해당 userId 항목 자체를 지워 메모리를 회수합니다.
 * @sideeffect connectionsByUserId Map을 변경합니다.
 */
export function unregisterNotificationConnection(
  userId: string,
  response: Response,
): void {
  const existing = connectionsByUserId.get(userId);

  if (!existing) {
    return;
  }

  existing.delete(response);

  if (existing.size === 0) {
    connectionsByUserId.delete(userId);
  }
}

/**
 * 대상 사용자의 모든 연결에 알림 이벤트를 push합니다.
 *
 * 반드시 알림을 만든 트랜잭션이 커밋된 뒤에만 호출해야 합니다. 트랜잭션 내부에서 호출하면
 * 이후 롤백될 경우 실제로 저장되지 않은 알림을 클라이언트가 먼저 받는 상황이 생길 수 있습니다.
 * 연결이 없는 사용자(오프라인이거나 이 endpoint에 연결하지 않은 탭만 있는 경우)는 조용히
 * 무시합니다 — 알림 자체는 이미 DB에 저장되어 있으므로 다음 목록 조회에서 확인할 수 있습니다.
 * @param userId push 대상 User.id
 * @param payload 화면이 표시하거나 캐시 무효화 트리거로 쓸 최소 정보
 * @sideeffect 연결된 모든 Response에 SSE `notification` 이벤트를 write합니다.
 */
export function publishNotificationToUser(
  userId: string,
  payload: NotificationStreamPayload,
): void {
  const connections = connectionsByUserId.get(userId);

  if (!connections || connections.size === 0) {
    return;
  }

  const message = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const connection of connections) {
    try {
      connection.write(message);
    } catch {
      // 이미 끊어진 연결에 쓰기를 시도하면 예외가 날 수 있습니다. 한 연결의 실패가 다른
      // 연결로의 push를 막지 않도록 무시하며, 정리는 request의 close 이벤트가 담당합니다.
    }
  }
}

/**
 * 서버 종료 시 열려있는 모든 SSE 연결을 강제로 끊어 graceful shutdown이 멈추지 않게 합니다.
 *
 * SSE 연결은 의도적으로 끝나지 않는 장기 연결이라 `server.close()`는 이 연결들이 스스로
 * 끝나기를 기다리며 멈춰 있게 됩니다. 이 함수는 등록된 모든 Response에 `.end()`를 호출해
 * 연결을 끊고, 그 결과로 각 요청에서 발생하는 `request.on("close")` 핸들러가 heartbeat
 * 정리와 `unregisterNotificationConnection`을 뒤따라 수행하도록 유도합니다. 이미 끊어진
 * 연결에 `.end()`를 호출하면 예외가 날 수 있어 개별적으로 감싸 한 연결의 실패가 나머지
 * 연결 정리를 막지 않게 합니다. 마지막으로 Map 자체를 비워 이후 어떤 push도 발생하지
 * 않도록 합니다(개별 연결의 뒤이은 unregister 호출은 없는 userId를 조용히 무시하므로
 * 이중 정리로 인한 오류는 없습니다).
 * @sideeffect connectionsByUserId의 모든 Response를 종료하고 Map을 비웁니다.
 */
export function closeAllNotificationConnections(): void {
  for (const connections of connectionsByUserId.values()) {
    for (const connection of connections) {
      try {
        connection.end();
      } catch {
        // 이미 끊어진 연결에 end()를 호출하면 예외가 날 수 있습니다. 서버 종료 절차를
        // 막지 않도록 개별 실패는 무시하고 나머지 연결 정리를 계속합니다.
      }
    }
  }

  connectionsByUserId.clear();
}
