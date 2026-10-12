-- 회원 탈퇴를 hard delete에서 soft delete로 바꾸기 위한 탈퇴 시각 컬럼입니다.
-- 기존 계정은 NULL(탈퇴하지 않음)이며 기존 데이터는 변경하지 않습니다.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

-- 기사님 탈퇴로 대기 중이던 견적이 삭제될 때 견적을 받은 고객에게 보내는 알림 유형입니다.
ALTER TYPE "NotificationType" ADD VALUE 'QUOTE_CANCELED_BY_MOVER_WITHDRAWAL';
