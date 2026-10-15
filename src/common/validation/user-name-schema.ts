/**
 * 회원가입과 프로필 수정에서 사용하는 사용자 이름 검증 규칙을 제공합니다.
 * 프론트엔드와 동일하게 완성형 한글·영문 이름 및 제한된 단어 구분자만 허용합니다.
 * 이름을 새로 저장하는 가입·수정에는 userNameSchema를, 이미 저장된 이름과 대조만 하는 본인 확인에는 userNameFormatSchema를 씁니다.
 */
import { z } from "zod";

import { isReservedWithdrawnAccountName } from "../constants/withdrawn-account";

export const USER_NAME_ERROR_MESSAGE =
  "이름은 한글 또는 영문으로 1~50자 입력해 주세요.";

export const RESERVED_USER_NAME_ERROR_MESSAGE = "사용할 수 없는 이름입니다.";

const USER_NAME_PATTERN = /^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$/u;

/**
 * 앞뒤 공백을 제거한 뒤 사용자 이름의 길이와 문자 구성만 검증합니다.
 * @remarks 이름 단어 사이의 공백, 하이픈, 아포스트로피, 가운뎃점을 허용합니다.
 * 계정 찾기처럼 입력값을 이미 저장된 이름과 대조만 하는 곳에서 사용합니다.
 * 예약어 거절을 넣으면 그 규칙이 생기기 전에 가입한 계정이 본인 확인을 통과하지 못하므로 형식만 봅니다.
 */
export const userNameFormatSchema = z
  .string({ error: USER_NAME_ERROR_MESSAGE })
  .trim()
  .min(1, { error: USER_NAME_ERROR_MESSAGE })
  .max(50, { error: USER_NAME_ERROR_MESSAGE })
  .regex(USER_NAME_PATTERN, { error: USER_NAME_ERROR_MESSAGE });

/**
 * 이름을 새로 저장하는 회원가입·프로필 수정용 검증입니다. 형식 검증에 더해 탈퇴 계정 표시용 예약어를 거절합니다.
 * @remarks "탈퇴한 회원"·"탈퇴한 기사님"을 저장하면 활동 중인 계정이 탈퇴 계정으로 잘못 표시됩니다.
 */
export const userNameSchema = userNameFormatSchema.refine(
  (name) => !isReservedWithdrawnAccountName(name),
  { error: RESERVED_USER_NAME_ERROR_MESSAGE },
);
