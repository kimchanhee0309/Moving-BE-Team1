/**
 * 탈퇴(soft delete) 계정을 익명화할 때 저장하는 값과, 화면에 보일 고정 문구 변환을 한 곳에서 정의합니다.
 * 탈퇴 계정의 row는 리뷰와 완료된 견적을 보존하기 위해 남기되 개인정보는 이 값들로 즉시 교체합니다.
 * 탈퇴 여부 판정(User.deletedAt)과 탈퇴 처리 transaction은 auth 모듈이 담당합니다.
 */

/** 탈퇴한 일반 유저의 User.name이며 리뷰·견적 화면에 그대로 표시됩니다. */
export const WITHDRAWN_CUSTOMER_NAME = "탈퇴한 회원";

/** 탈퇴한 기사님의 User.name이자 화면에 보일 닉네임 고정 문구입니다. */
export const WITHDRAWN_MOVER_NAME = "탈퇴한 기사님";

// Mover.nickname은 unique라 모든 탈퇴 기사님에게 같은 문구를 저장할 수 없습니다.
// 고정 문구 뒤에 User UUID(하이픈 제거 32자)를 붙여 유일하게 저장하고, 응답에서는 고정 문구로 바꿉니다.
const WITHDRAWN_MOVER_NICKNAME_PATTERN = /^탈퇴한 기사님#[0-9a-f]{32}$/;

/**
 * 탈퇴 계정의 로그인·중복 확인에 다시 걸리지 않는 유일한 대체 이메일을 만듭니다.
 * @param userId 탈퇴하는 User UUID
 * @returns 수신할 수 없는 예약 도메인(.invalid)의 이메일. 원래 이메일은 unique에서 풀려 즉시 재가입할 수 있습니다.
 */
export function createWithdrawnEmail(userId: string): string {
  return `withdrawn-${userId}@withdrawn.invalid`;
}

/**
 * 탈퇴한 기사님의 Mover.nickname으로 저장할 유일한 값을 만듭니다.
 * @param userId 탈퇴하는 User UUID
 * @returns `탈퇴한 기사님#<32자리 hex>` 형식(40자, nickname 최대 50자 이내)
 */
export function createWithdrawnMoverNickname(userId: string): string {
  return `${WITHDRAWN_MOVER_NAME}#${userId.replace(/-/g, "").toLowerCase()}`;
}

/** 기사님이 직접 고른 닉네임이 탈퇴 계정 저장 형식과 겹치는지 확인합니다. 겹치면 탈퇴 기사님으로 잘못 표시되므로 등록을 거절합니다. */
export function isWithdrawnMoverNickname(nickname: string): boolean {
  return WITHDRAWN_MOVER_NICKNAME_PATTERN.test(nickname);
}

/**
 * DB의 기사님 닉네임을 응답용 문구로 바꿉니다.
 * @param nickname Mover.nickname
 * @returns 탈퇴 계정 저장 형식이면 고정 문구 "탈퇴한 기사님", 아니면 원래 닉네임
 * @remarks 탈퇴한 기사님이 남는 화면(고객의 완료된 견적, 작성한 리뷰)의 응답 조립에서 사용합니다.
 */
export function toDisplayMoverNickname(nickname: string): string {
  return isWithdrawnMoverNickname(nickname) ? WITHDRAWN_MOVER_NAME : nickname;
}
