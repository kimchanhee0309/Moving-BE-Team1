-- 알림 문장 변수를 저장하는 nullable 컬럼을 추가합니다.
-- 기존 행은 NULL로 남고 content(한국어 문장)는 그대로 유지되므로 데이터 손실이 없습니다.
ALTER TABLE "Notification" ADD COLUMN "params" JSONB;
