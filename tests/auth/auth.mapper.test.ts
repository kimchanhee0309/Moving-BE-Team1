/**
 * Auth 공개 사용자 mapper가 비밀 필드를 제거하고 역할별 profile 등록 상태만 노출하는지 검증합니다.
 * DB와 JWT는 사용하지 않으며 Repository 조회 결과를 고정 입력으로 사용합니다.
 */
import { toAuthUserDto } from "../../src/modules/auth/auth.mapper";
import type { AuthUserRecord } from "../../src/modules/auth/auth.repository";

const baseUser: AuthUserRecord = {
  id: "user-id",
  name: "홍길동",
  email: "user@example.com",
  phone: "01012345678",
  role: "CUSTOMER",
  passwordHash: "bcrypt-hash",
  customer: null,
  mover: { id: "unrelated-mover-profile" },
};

describe("Auth user mapper", () => {
  test("CUSTOMER는 Customer relation만 확인하고 passwordHash와 profile ID를 제외한다", () => {
    expect(toAuthUserDto(baseUser)).toEqual({
      id: "user-id",
      name: "홍길동",
      email: "user@example.com",
      phone: "01012345678",
      role: "CUSTOMER",
      profileCompleted: false,
    });
  });

  test("MOVER는 Mover relation 존재 여부로 profileCompleted를 계산한다", () => {
    expect(toAuthUserDto({ ...baseUser, role: "MOVER" })).toMatchObject({
      role: "MOVER",
      profileCompleted: true,
    });
  });
});
