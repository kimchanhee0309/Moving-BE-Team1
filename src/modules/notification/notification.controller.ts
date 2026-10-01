/**
 * 알림 목록·읽음 처리 HTTP 입력을 DTO로 바꾸고 Service 결과를 공통 응답으로 반환하며,
 * SSE 스트림 연결의 수립·정리를 담당합니다.
 * Cookie·JWT를 다시 해석하지 않으며 소유권·상태 규칙은 Service에 위임합니다.
 */
import type { RequestHandler } from "express";

import { HTTP_STATUS } from "../../common/constants/http-status";
import { sendSuccess } from "../../common/response/api-response";
import { getAuthContext } from "../../common/utils/auth-context";
import {
  registerNotificationConnection,
  unregisterNotificationConnection,
} from "./notification.hub";
import {
  listNotifications,
  markNotificationAsRead,
} from "./notification.service";
import {
  parseNotificationIdParams,
  parseNotificationListQuery,
} from "./notification.validator";

/**
 * SSE 연결이 프록시·브라우저의 idle timeout으로 끊기지 않도록 보내는 heartbeat 주기입니다.
 * 값은 팀 확정 명세가 아니라 일반적인 SSE 권장 범위(15~30초)를 따른 잠정값입니다.
 */
const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * GET /notifications
 * 입력 검증 → 인증 주체 추출 → 목록 조회 → data.items 응답
 */
export const listNotificationsController: RequestHandler = async (
  request,
  response,
) => {
  const query = parseNotificationListQuery(request.query);
  const auth = getAuthContext(request);
  const result = await listNotifications(auth.userId, query);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * PATCH /notifications/:notificationId/read
 * 입력 검증 → 인증 주체 추출 → 읽음 처리 → data.notification 응답
 */
export const markNotificationReadController: RequestHandler = async (
  request,
  response,
) => {
  const notificationId = parseNotificationIdParams(request.params);
  const auth = getAuthContext(request);
  const result = await markNotificationAsRead(auth.userId, notificationId);

  return sendSuccess(response, HTTP_STATUS.OK, result);
};

/**
 * GET /notifications/stream
 * 인증 주체 추출 → SSE 헤더 설정 → 허브 등록 → heartbeat 전송 → 연결 종료 시 정리
 *
 * EventSource는 커스텀 헤더를 보낼 수 없어 이 endpoint는 HttpOnly accessToken 쿠키만으로
 * 인증합니다. 프론트는 반드시 `new EventSource(url, { withCredentials: true })`로 열어야
 * 쿠키가 전송됩니다(옵션이 없으면 401).
 * 이 handler는 response.end()를 직접 호출하지 않고 클라이언트가 연결을 끊거나 서버가
 * 종료될 때까지 열어 둡니다.
 */
export const streamNotificationsController: RequestHandler = (
  request,
  response,
) => {
  const auth = getAuthContext(request);

  // 배포 환경에서 nginx 같은 프록시를 거치면 응답 버퍼링 때문에 이벤트가 지연될 수 있어
  // X-Accel-Buffering: no로 버퍼링을 끄도록 안내합니다. 프록시가 없는 현재 dev 환경에는
  // 영향이 없습니다.
  response.writeHead(HTTP_STATUS.OK, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 연결 직후 클라이언트가 재연결 대기 없이 스트림이 열렸음을 바로 알 수 있도록
  // comment 한 줄을 먼저 보냅니다. comment(:로 시작하는 줄)는 EventSource가 이벤트로
  // 파싱하지 않습니다.
  response.write(": connected\n\n");

  registerNotificationConnection(auth.userId, response);

  const heartbeat = setInterval(() => {
    response.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  // 클라이언트가 탭을 닫거나 네트워크가 끊기면 heartbeat 타이머와 허브 등록을 반드시 함께
  // 정리해야 합니다. 타이머만 두면 이미 닫힌 연결에 계속 heartbeat write를 시도하고,
  // 허브 등록만 두면 setInterval이 메모리에 계속 남습니다.
  request.on("close", () => {
    clearInterval(heartbeat);
    unregisterNotificationConnection(auth.userId, response);
  });
};
