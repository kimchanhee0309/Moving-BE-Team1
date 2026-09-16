/**
 * Repository의 User 조회 결과를 외부 Auth 응답 DTO로 변환합니다.
 * 비밀번호 hash와 profile 식별자는 노출하지 않으며 DB 조회·JWT 발급은 담당하지 않습니다.
 */
import type { AuthUserDto } from "./auth.dto";
import type { AuthUserRecord } from "./auth.repository";

/**
 * 역할에 해당하는 profile relation으로 등록 완료 여부를 계산합니다.
 * @param user Auth Repository가 필요한 relation까지 조회한 내부 사용자 객체
 * @returns 민감정보가 제거된 공개 사용자 DTO
 * @throws 오류를 발생시키지 않으며 DB·cookie·token을 변경하지 않습니다.
 */
export function toAuthUserDto(user: AuthUserRecord): AuthUserDto {
  const profileCompleted =
    user.role === "CUSTOMER" ? user.customer !== null : user.mover !== null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    profileCompleted,
  };
}
