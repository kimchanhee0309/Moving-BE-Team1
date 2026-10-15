/**
 * MOVE_DAY 알림을 매일 정해진 시각에 발송하도록 node-cron 스케줄을 등록·해제합니다.
 * 실제 대상 판별·알림 생성·SSE push 로직은 move-day.service.ts의 runMoveDayNotificationJob이
 * 담당하고, 이 파일은 "언제 실행할지"와 "실행 실패가 서버에 영향을 주지 않게" 만드는 부분만
 * 책임집니다. server.ts는 이 모듈이 내보내는 시작·정지 함수만 호출하고 cron 세부사항을
 * 알지 못합니다(server.ts는 process/서버 lifecycle만 담당한다는 AGENTS.md 규칙을 따름).
 *
 * ⚠️ 단일 Node 프로세스 배포 전제: 아래 noOverlap은 같은 프로세스 안에서 cron이 겹쳐 실행되는
 * 것만 막습니다. 여러 서버 인스턴스가 동시에 떠 있으면 각 인스턴스가 독립적으로 이 스케줄을
 * 등록하므로 같은 시각에 중복 실행될 수 있고, move-day.repository.ts의 "기존 알림 조회 후
 * 생성" 방식은 인스턴스 간 경쟁을 막지 못해 같은 알림이 중복 생성될 수 있습니다(AGENTS.md 8번의
 * rate limit/OAuth state와 동일한 단일 프로세스 메모리 전제). 다중 인스턴스로 배포하려면 팀
 * 승인 후 분산 lock이나 scheduler leader 지정, 또는 DB 수준 멱등 처리를 먼저 도입해야 합니다.
 */
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";

import { runMoveDayNotificationJob } from "./move-day.service";

// 매일 한국시간(Asia/Seoul) 오후 5시(17:00) 1회 실행. 분·시·일·월·요일 순서의 5필드 cron 표현식.
const MOVE_DAY_CRON_EXPRESSION = "0 17 * * *";

let scheduledTask: ScheduledTask | undefined;

/**
 * MOVE_DAY 알림 실행 실패를 로그로만 남기고 삼킵니다.
 *
 * 확정 견적이 없는 예외적 데이터, 일시적 DB 오류 등으로 이번 실행이 실패해도 서버 프로세스
 * 자체가 죽거나 다음 스케줄(다음 날 17시)에 영향을 주면 안 됩니다. stack trace나 오류 메시지
 * 원문에는 조회 조건에 쓰인 값이 섞여 있을 수 있어 로그에 남기지 않고 고정 문구만 남깁니다.
 * @sideeffect console.error로 고정 문구를 기록합니다(민감정보·stack trace 미포함).
 */
function runJobSafely(): void {
  runMoveDayNotificationJob().catch(() => {
    console.error("MOVE_DAY 알림 스케줄러 실행 중 오류가 발생했습니다.");
  });
}

/**
 * MOVE_DAY 알림 cron 스케줄을 등록합니다.
 *
 * 이미 등록된 task가 있으면 다시 등록하지 않습니다(서버가 재시작 없이 이 함수를 두 번 호출할
 * 이유는 없지만, 방어적으로 중복 등록으로 인한 이중 발송 가능성 자체를 차단합니다).
 * noOverlap 옵션으로 이전 실행이 아직 끝나지 않았을 때 같은 task가 겹쳐 실행되는 것도 막습니다.
 * @sideeffect node-cron에 스케줄을 등록해 매일 KST 17:00에 runMoveDayNotificationJob을 실행합니다.
 */
export function startMoveDayNotificationScheduler(): void {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule(MOVE_DAY_CRON_EXPRESSION, runJobSafely, {
    timezone: "Asia/Seoul",
    name: "move-day-notification",
    noOverlap: true,
  });
}

/**
 * 등록된 MOVE_DAY 알림 cron 스케줄을 정지하고 참조를 정리합니다.
 * graceful shutdown(SIGTERM/SIGINT) 시 server.ts가 호출해 타이머가 프로세스 종료를 막지
 * 않도록 합니다. 등록된 적이 없으면 아무 일도 하지 않습니다.
 * @sideeffect node-cron task를 stop합니다.
 */
export function stopMoveDayNotificationScheduler(): void {
  if (!scheduledTask) {
    return;
  }

  scheduledTask.stop();
  scheduledTask = undefined;
}
