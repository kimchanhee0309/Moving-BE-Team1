/**
 * abbreviateAddress가 도로명 주소를 "광역시도(구체 지역)" 형태로 올바르게 축약하는지 검증합니다.
 * 완전한 행정구역 사전 없이 접미사 제거 + 예외 목록으로 동작하는 휴리스틱이므로,
 * 팀이 확정한 예시(경기(일산), 서울(영등포))와 대표적인 엣지 케이스(세종, 제주)를 함께 검증합니다.
 */
import { abbreviateAddress } from "../../src/modules/notification/move-day.address";

describe("abbreviateAddress", () => {
  test("일산동구처럼 예외 목록에 등록된 지역은 예외 매핑을 사용한다", () => {
    expect(abbreviateAddress("경기도 고양시 일산동구 중앙로 1000")).toBe("경기(일산)");
  });

  test("일반적인 구 단위 주소는 '구' 접미사만 제거한다", () => {
    expect(abbreviateAddress("서울특별시 영등포구 여의대로 108")).toBe("서울(영등포)");
  });

  test("도로명 주소 토큰이 4개 미만이면 구체 지역 없이 광역시도만 반환한다", () => {
    expect(abbreviateAddress("세종특별자치시 도움6로 42")).toBe("세종");
  });

  test("구체 지역 축약이 광역시도 축약과 같으면 괄호 없이 광역시도만 반환한다", () => {
    expect(abbreviateAddress("제주특별자치도 제주시 문연로 6")).toBe("제주");
  });

  test("마포구처럼 예외 목록에 없는 구는 '구' 접미사만 제거한다", () => {
    expect(abbreviateAddress("서울특별시 마포구 월드컵로 1")).toBe("서울(마포)");
  });
});
