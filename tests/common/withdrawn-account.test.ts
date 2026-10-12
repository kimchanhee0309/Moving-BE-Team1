/**
 * 탈퇴 계정 익명화 값이 유일하고 원래 정보를 담지 않는지, 화면용 고정 문구 변환이 정확한지 검증합니다.
 * DB에는 접속하지 않습니다.
 */
import {
  WITHDRAWN_CUSTOMER_NAME,
  WITHDRAWN_MOVER_NAME,
  createWithdrawnEmail,
  createWithdrawnMoverNickname,
  isWithdrawnMoverNickname,
  toDisplayMoverNickname,
} from "../../src/common/constants/withdrawn-account";

const USER_ID = "550E8400-e29b-41d4-a716-446655440000";

describe("Withdrawn account values", () => {
  test("탈퇴 계정의 대체 이메일은 User마다 다르고 수신할 수 없는 예약 도메인을 쓴다", () => {
    expect(createWithdrawnEmail(USER_ID)).toBe(`withdrawn-${USER_ID}@withdrawn.invalid`);
    expect(createWithdrawnEmail(USER_ID)).not.toBe(
      createWithdrawnEmail("550e8400-e29b-41d4-a716-446655440001"),
    );
    // User.email 컬럼 길이(255자) 안에 들어가야 합니다.
    expect(createWithdrawnEmail(USER_ID).length).toBeLessThanOrEqual(255);
  });

  test("탈퇴 기사님 닉네임은 unique 제약을 지키도록 User ID를 붙이고 50자 이내다", () => {
    const nickname = createWithdrawnMoverNickname(USER_ID);

    expect(nickname).toBe("탈퇴한 기사님#550e8400e29b41d4a716446655440000");
    expect(nickname.length).toBeLessThanOrEqual(50);
    expect(isWithdrawnMoverNickname(nickname)).toBe(true);
  });

  test("응답에서는 탈퇴 저장 형식만 고정 문구로 바꾸고 일반 닉네임은 그대로 둔다", () => {
    expect(toDisplayMoverNickname(createWithdrawnMoverNickname(USER_ID))).toBe(WITHDRAWN_MOVER_NAME);
    // 고정 문구로 시작하더라도 저장 형식(# + 32자리 hex)이 아니면 사용자가 정한 닉네임입니다.
    for (const nickname of ["김기사", "탈퇴한 기사님", "탈퇴한 기사님#1234", "탈퇴한 기사님 이사"]) {
      expect(isWithdrawnMoverNickname(nickname)).toBe(false);
      expect(toDisplayMoverNickname(nickname)).toBe(nickname);
    }
  });

  test("화면 고정 문구는 일반 유저와 기사님을 구분한다", () => {
    expect(WITHDRAWN_CUSTOMER_NAME).toBe("탈퇴한 회원");
    expect(WITHDRAWN_MOVER_NAME).toBe("탈퇴한 기사님");
  });
});
