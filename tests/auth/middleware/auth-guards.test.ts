/**
 * 팀 공통 Router guard가 인증 → 역할 → profile 순서를 고정하는지 검증합니다.
 */
jest.mock("../../../src/common/utils/user-profile", () => ({
  findUserProfileState: jest.fn(),
}));

import { authenticate } from "../../../src/common/middleware/auth/authenticate";
import {
  requireAuthenticated,
  requireCustomer,
  requireMover,
  requireProfiledCustomer,
  requireProfiledMover,
  requireProfiledUser,
} from "../../../src/common/middleware/auth/auth-guards";
import { requireProfile } from "../../../src/common/middleware/auth/require-profile";

describe("Auth guard combinations", () => {
  test("공통 로그인 guard는 authenticate만 적용한다", () => {
    expect(requireAuthenticated).toEqual([authenticate]);
  });

  test("프로필 생성용 역할 guard에는 requireProfile이 없다", () => {
    expect(requireCustomer).toHaveLength(2);
    expect(requireMover).toHaveLength(2);
    expect(requireCustomer).not.toContain(requireProfile);
    expect(requireMover).not.toContain(requireProfile);
  });

  test("개인 기능 guard는 마지막에 requireProfile을 적용한다", () => {
    expect(requireProfiledCustomer.at(-1)).toBe(requireProfile);
    expect(requireProfiledMover.at(-1)).toBe(requireProfile);
    expect(requireProfiledUser).toEqual([authenticate, requireProfile]);
  });
});
