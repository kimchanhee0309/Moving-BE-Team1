/**
 * 이사 요청 완료 전이(runMoveRequestCompletionJob)를 주기적으로 실행하도록 node-cron 스케줄을
 * 등록·해제합니다. 실제 전이 조건과 query는 move-request-completion.service.ts와 repository가
 * 담당하고, 이 파일은 "언제 실행할지"와 "실행 실패가 서버에 영향을 주지 않게" 만드는 부분만
 * 책임집니다. server.ts는 시작·정지 함수만 호출합니다.
 *
 * 매시간 실행하는 이유: 완료 기준은 UTC 날짜 경계(KST 09:00)에 바뀌지만, 서버가 그 시각에
 * 내려가 있었거나 한 번 실패해도 다음 실행에서 자연스럽게 따라잡게 하기 위해서입니다. 전이는
 * 멱등한 조건부 updateMany 한 번이라 자주 실행해도 비용과 중복 위험이 작습니다. 같은 이유로
 * 서버 시작 직후에도 한 번 실행해 배포·재시작 동안 밀린 전이를 바로 반영합니다.
 *
 * ⚠️ 단일 Node 프로세스 배포 전제는 move-day.scheduler.ts와 같습니다. 다만 이 작업은 멱등이라
 * 여러 인스턴스에서 동시에 실행되어도 같은 요청이 두 번 전이되거나 데이터가 어긋나지 않습니다.
 */
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";

import { runMoveRequestCompletionJob } from "./move-request-completion.service";

// 매시간 5분(Asia/Seoul)에 실행. 정각에 몰리는 다른 작업과 겹치지 않도록 5분으로 둡니다.
const MOVE_REQUEST_COMPLETION_CRON_EXPRESSION = "5 * * * *";

let scheduledTask: ScheduledTask | undefined;

/**
 * 완료 전이 실행 실패를 로그로만 남기고 삼킵니다.
 *
 * 일시적 DB 오류로 이번 실행이 실패해도 서버 프로세스가 죽거나 다음 실행에 영향을 주면 안 됩니다.
 * 오류 원문에는 query 조건이 섞일 수 있어 고정 문구만 남깁니다.
 * @sideeffect console.error로 고정 문구를 기록합니다(민감정보·stack trace 미포함).
 */
function runJobSafely(): void {
  runMoveRequestCompletionJob().catch(() => {
    console.error("이사 요청 완료 처리 스케줄러 실행 중 오류가 발생했습니다.");
  });
}

/**
 * 완료 전이 cron 스케줄을 등록하고, 밀린 전이를 반영하도록 즉시 한 번 실행합니다.
 *
 * 이미 등록된 task가 있으면 다시 등록하지 않습니다. noOverlap으로 이전 실행이 끝나지 않았을 때
 * 겹쳐 실행되는 것도 막습니다.
 * @sideeffect node-cron에 스케줄을 등록하고, MoveRequest.status 갱신 query를 즉시 1회 실행합니다.
 */
export function startMoveRequestCompletionScheduler(): void {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule(MOVE_REQUEST_COMPLETION_CRON_EXPRESSION, runJobSafely, {
    timezone: "Asia/Seoul",
    name: "move-request-completion",
    noOverlap: true,
  });

  runJobSafely();
}

/**
 * 등록된 완료 전이 cron 스케줄을 정지하고 참조를 정리합니다.
 * graceful shutdown 시 server.ts가 호출해 타이머가 프로세스 종료를 막지 않도록 합니다.
 * 등록된 적이 없으면 아무 일도 하지 않습니다.
 * @sideeffect node-cron task를 stop합니다.
 */
export function stopMoveRequestCompletionScheduler(): void {
  if (!scheduledTask) {
    return;
  }

  scheduledTask.stop();
  scheduledTask = undefined;
}
