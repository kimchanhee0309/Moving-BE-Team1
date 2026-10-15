/**
 * 이사일이 지난 확정 요청을 완료(COMPLETED)로 바꾸는 상태 전이 실행 단위입니다.
 *
 * 흐름: 요청(WAITING) → 고객의 견적 확정(CONFIRMED) → 이사일 경과 → 완료(COMPLETED) → 리뷰 작성 가능.
 * 리뷰 작성(review 모듈)과 기사님 보낸 견적의 "이사 완료" 표시는 COMPLETED를 기준으로 하지만,
 * 이 전이를 담당하는 곳이 없어 이사가 끝나도 리뷰를 쓸 수 없었습니다. 이 파일이 그 전이를 담당합니다.
 *
 * cron 등록은 move-request-completion.scheduler.ts가, Prisma query는 move-request.repository.ts가
 * 담당합니다. 이 파일은 "지금이 언제든" 한 번 호출하면 그 시점 기준으로 전이를 수행하는 함수만
 * 제공해 cron 타이밍 없이 테스트할 수 있게 합니다. 알림 발송과 리뷰 생성은 담당하지 않습니다.
 */
import { completePastConfirmedMoveRequests } from "./move-request.repository";

/**
 * 기준 시각 기준으로 이사일이 지난 CONFIRMED 요청을 모두 COMPLETED로 전이합니다.
 *
 * 여러 번 실행해도 안전합니다(이미 COMPLETED인 요청은 조건에 걸리지 않음). 실패 처리(로그만 남기고
 * 삼키기)는 호출하는 scheduler가 담당하므로 여기서는 오류를 그대로 던집니다.
 * @param now 기준 시각. 기본값은 현재 시각이며 테스트에서 고정 시각을 주입합니다.
 * @returns 이번 실행에서 COMPLETED로 바뀐 요청 수
 * @throws Prisma 오류(DB 연결 실패 등)
 * @sideeffect MoveRequest.status를 갱신합니다.
 */
export function runMoveRequestCompletionJob(now: Date = new Date()): Promise<number> {
  return completePastConfirmedMoveRequests(now);
}
