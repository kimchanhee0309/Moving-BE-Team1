/**
 * MOVE_DAY(이사 당일 리마인드) 알림의 대상 판별·중복 방지·SSE push를 담당하는 핵심 로직입니다.
 * cron 등록 자체는 move-day.scheduler.ts가 담당하고, 이 파일은 "지금이 언제든" 한 번 호출하면
 * 그 시점 기준으로 내일이 이사일인 CONFIRMED 요청을 찾아 알림을 만드는 순수한 실행 단위만
 * 제공합니다 — cron 타이밍을 mock하기 어려운 테스트 대신 이 함수를 직접 호출해 검증합니다.
 *
 * 알림 대상: 이사 예정일이 "내일"인 MoveRequest(status=CONFIRMED)의 고객과, 그 요청에서
 * 확정된(Quote.status=CONFIRMED) 견적의 기사님. 확정 견적이 없는 예외적 데이터라도 고객에게는
 * 보내고 기사님 알림만 생략합니다(에러를 던지지 않습니다).
 */
import { abbreviateAddress } from "./move-day.address";
import { publishNotificationToUser } from "./notification.hub";
import {
  createMoveDayNotifications,
  findConfirmedMoveRequestsByMoveDate,
  findExistingMoveDayNotificationRecipients,
  type ConfirmedMoveRequestForMoveDay,
  type CreatedMoveDayNotificationRecord,
} from "./move-day.repository";
import type { NotificationParams } from "./notification.dto";

/**
 * 기준 시각(now)의 UTC 캘린더 날짜 다음 날 UTC 자정 instant를 계산합니다.
 *
 * moveDate는 이사일의 UTC 자정 instant로 저장되므로(move-request.service.ts 관례),
 * "내일"도 같은 기준(UTC 캘린더 날짜)으로 계산해야 MoveRequest.moveDate와 정확히 일치
 * 비교할 수 있습니다. 스케줄러는 KST 17:00(=UTC 08:00)에 실행되며 이는 UTC 날짜 경계를
 * 넘지 않는 시각이라 now의 UTC 날짜를 "오늘"로 취급해도 안전합니다.
 * @param now 기준 시각(테스트에서 주입 가능하도록 매개변수로 받습니다)
 */
function computeTomorrowUtcMidnight(now: Date): Date {
  const todayUtcMidnight = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);

  return new Date(todayUtcMidnight.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * MOVE_DAY 알림 content를 만듭니다.
 *
 * 고객·기사님 수신자와 관계없이 완전히 동일한 문구("내일은 {출발지 축약} → {도착지 축약}
 * 이사 예정일이에요.")를 사용합니다(팀 확정 문구). 기사 닉네임·고객 이름은 더 이상 문구에
 * 포함하지 않으므로 확정 견적 유무와 무관하게 항상 같은 결과를 반환합니다.
 */
/**
 * MOVE_DAY 알림의 문장 변수를 만듭니다. content와 같은 주소 약칭을 사용합니다.
 *
 * @param moveRequest 확정된 이사 요청
 * @returns from·to 주소 약칭
 */
function buildMoveDayParams(moveRequest: ConfirmedMoveRequestForMoveDay): NotificationParams {
  return {
    from: abbreviateAddress(moveRequest.fromAddress),
    to: abbreviateAddress(moveRequest.toAddress),
  };
}

function buildMoveDayContent(moveRequest: ConfirmedMoveRequestForMoveDay): string {
  const fromAbbrev = abbreviateAddress(moveRequest.fromAddress);
  const toAbbrev = abbreviateAddress(moveRequest.toAddress);

  return `내일은 ${fromAbbrev} → ${toAbbrev} 이사 예정일이에요.`;
}

/**
 * 고객에게 보낼 MOVE_DAY 알림 후보 1건을 만듭니다.
 * quoteId는 확정 견적이 있으면 그 견적을, 없으면(데이터 이상) null을 사용합니다.
 */
function buildCustomerCandidate(
  moveRequest: ConfirmedMoveRequestForMoveDay,
  confirmedQuote: ConfirmedMoveRequestForMoveDay["quotes"][number] | undefined,
): CreatedMoveDayNotificationRecord {
  return {
    userId: moveRequest.customer.userId,
    moveRequestId: moveRequest.id,
    quoteId: confirmedQuote ? confirmedQuote.id : null,
    type: "MOVE_DAY",
    title: "내일은 이사 예정일입니다.",
    content: buildMoveDayContent(moveRequest),
    params: buildMoveDayParams(moveRequest),
  };
}

/** 확정 견적의 기사님에게 보낼 MOVE_DAY 알림 후보 1건을 만듭니다. */
function buildMoverCandidate(
  moveRequest: ConfirmedMoveRequestForMoveDay,
  confirmedQuote: ConfirmedMoveRequestForMoveDay["quotes"][number],
): CreatedMoveDayNotificationRecord {
  return {
    userId: confirmedQuote.mover.userId,
    moveRequestId: moveRequest.id,
    quoteId: confirmedQuote.id,
    type: "MOVE_DAY",
    title: "내일은 이사 예정일입니다.",
    content: buildMoveDayContent(moveRequest),
    params: buildMoveDayParams(moveRequest),
  };
}

/** 중복 확인을 위한 (moveRequestId, userId) 합성 key입니다. */
function toRecipientKey(moveRequestId: string, userId: string): string {
  return `${moveRequestId}:${userId}`;
}

/**
 * MOVE_DAY 알림 발송의 핵심 로직입니다.
 *
 * 처리 순서:
 * 1. now 기준 "내일"의 UTC 자정 instant를 계산합니다.
 * 2. 그 날짜가 이사일이고 상태가 CONFIRMED인 요청과, 각 요청의 확정 견적을 조회합니다.
 * 3. 각 요청의 고객 1명 + 확정 견적의 기사님(0명 또는 1명)을 후보로 만듭니다.
 * 4. 이미 MOVE_DAY 알림을 받은 (moveRequestId, userId) 조합은 후보에서 제외합니다(중복 발송 방지 —
 *    서버 재시작·재배포로 스케줄러가 하루에 여러 번 실행돼도 같은 조합에 두 번 생성되지 않도록 함).
 * 5. 남은 후보만 Notification row로 생성하고, 생성된 건에 한해 SSE push합니다.
 *
 * DB row 생성 이후에만 push하므로 push 시점에 수신자가 연결돼 있지 않아도 알림 자체는 이미
 * 저장되어 있어 이후 `GET /notifications`로 조회할 수 있습니다(다른 알림 트리거와 동일한 관례).
 *
 * @param now 기준 시각. 스케줄러는 실행 시각을 그대로 넘기고, 테스트는 임의 시각을 주입합니다.
 * @returns 실제로 새로 생성한 알림 목록(모두 이미 발송됐거나 대상이 없으면 빈 배열)
 * @sideeffect PostgreSQL 읽기·쓰기와, 연결된 SSE 클라이언트로의 push를 수행합니다.
 * 이 함수 자체는 예외를 삼키지 않으므로, 실패 시 로그만 남기고 다음 스케줄에 영향이 없게
 * 하는 처리는 호출부(move-day.scheduler.ts)의 책임입니다.
 */
export async function runMoveDayNotificationJob(
  now: Date = new Date(),
): Promise<CreatedMoveDayNotificationRecord[]> {
  const tomorrowUtcMidnight = computeTomorrowUtcMidnight(now);

  const moveRequests = await findConfirmedMoveRequestsByMoveDate(tomorrowUtcMidnight);

  if (moveRequests.length === 0) {
    return [];
  }

  const candidates: CreatedMoveDayNotificationRecord[] = [];

  for (const moveRequest of moveRequests) {
    // 정상 데이터라면 확정 견적은 0건 또는 1건이다(applyQuoteConfirmation이 나머지 PROPOSED
    // 견적을 REJECTED로 바꾸므로). 첫 번째 확정 견적만 고객 알림 문구에 사용하고, 존재하는
    // 모든 확정 견적의 기사님에게는 각각 알림을 보낸다(방어적으로 배열 전체를 순회).
    const primaryConfirmedQuote = moveRequest.quotes[0];

    candidates.push(buildCustomerCandidate(moveRequest, primaryConfirmedQuote));

    for (const confirmedQuote of moveRequest.quotes) {
      candidates.push(buildMoverCandidate(moveRequest, confirmedQuote));
    }
  }

  const moveRequestIds = [...new Set(candidates.map((candidate) => candidate.moveRequestId))];
  const existingRecipients = await findExistingMoveDayNotificationRecipients(moveRequestIds);
  const existingKeys = new Set(
    existingRecipients.map((recipient) => toRecipientKey(recipient.moveRequestId, recipient.userId)),
  );

  const newCandidates = candidates.filter(
    (candidate) => !existingKeys.has(toRecipientKey(candidate.moveRequestId, candidate.userId)),
  );

  const created = await createMoveDayNotifications(newCandidates);

  const createdAt = new Date().toISOString();

  for (const notification of created) {
    publishNotificationToUser(notification.userId, {
      type: notification.type,
      title: notification.title,
      content: notification.content,
      params: notification.params ?? null,
      moveRequestId: notification.moveRequestId,
      quoteId: notification.quoteId,
      createdAt,
    });
  }

  return created;
}
