/**
 * 개인정보를 바꾸는 transaction이 회원 탈퇴(soft delete·익명화)와 겹치지 않도록 User row를 잠그고 활성 계정인지 확인합니다.
 * 탈퇴는 User·Customer·Mover row를 남기므로, 탈퇴 직전에 guard를 통과한 프로필 수정이 탈퇴보다 늦게 커밋되면
 * 익명화한 이름·전화번호·닉네임·이미지가 다시 채워질 수 있습니다. 탈퇴 transaction도 같은 User row를 먼저 잠그므로
 * 두 작업은 한 줄로 실행되고, 탈퇴가 먼저 끝났다면 이 함수가 수정을 거절합니다.
 * profile 내용 조회와 수정 규칙은 각 profile 모듈이 담당합니다.
 */
import type { Prisma } from "../../generated/prisma/client";
import { UnauthorizedError } from "../errors/app-error";

function assertLocked(rows: Array<{ id: string }>): void {
  if (rows.length === 0) {
    // 탈퇴 전에 발급된 토큰이 profile guard에서 받는 응답과 같은 오류로 맞춥니다.
    throw new UnauthorizedError("사용자 정보를 확인할 수 없습니다.", "USER_NOT_FOUND");
  }
}

/**
 * User ID로 탈퇴하지 않은 계정의 row를 transaction이 끝날 때까지 잠급니다.
 * @param transaction 개인정보를 변경하는 transaction client
 * @param userId 인증된 User UUID
 * @throws 계정이 없거나 이미 탈퇴했으면 USER_NOT_FOUND(401)
 * @remarks 반드시 변경 쿼리보다 먼저 호출합니다. 탈퇴가 진행 중이면 끝날 때까지 기다린 뒤 판정합니다.
 */
export async function lockActiveUserById(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  assertLocked(
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT u."id" FROM "User" u
      WHERE u."id" = ${userId}::uuid AND u."deletedAt" IS NULL
      FOR UPDATE OF u
    `,
  );
}

/**
 * Customer profile ID로 그 소유자의 User row를 잠그고 활성 계정인지 확인합니다.
 * @param transaction 고객 프로필을 변경하는 transaction client
 * @param customerId profiled guard가 확정한 Customer UUID
 * @throws 소유 계정이 없거나 이미 탈퇴했으면 USER_NOT_FOUND(401)
 */
export async function lockActiveUserByCustomerId(
  transaction: Prisma.TransactionClient,
  customerId: string,
): Promise<void> {
  assertLocked(
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT u."id" FROM "User" u
      JOIN "Customer" c ON c."userId" = u."id"
      WHERE c."id" = ${customerId}::uuid AND u."deletedAt" IS NULL
      FOR UPDATE OF u
    `,
  );
}

/**
 * Mover profile ID로 그 소유자의 User row를 잠그고 활성 계정인지 확인합니다.
 * @param transaction 기사님 프로필·기본정보를 변경하는 transaction client
 * @param moverId profiled guard가 확정한 Mover UUID
 * @throws 소유 계정이 없거나 이미 탈퇴했으면 USER_NOT_FOUND(401)
 */
export async function lockActiveUserByMoverId(
  transaction: Prisma.TransactionClient,
  moverId: string,
): Promise<void> {
  assertLocked(
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT u."id" FROM "User" u
      JOIN "Mover" m ON m."userId" = u."id"
      WHERE m."id" = ${moverId}::uuid AND u."deletedAt" IS NULL
      FOR UPDATE OF u
    `,
  );
}
