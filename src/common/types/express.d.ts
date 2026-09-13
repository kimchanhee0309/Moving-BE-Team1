/**
 * 인증 미들웨어가 검증한 최소 사용자 정보를 Express Request에 확장합니다.
 * 비밀번호, 연락처, 토큰 원문은 요청 컨텍스트에 저장하지 않습니다.
 */
import type { UserRole } from "../../generated/prisma/enums";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
      };
    }
  }
}

export {};
