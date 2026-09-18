/**
 * 회원가입과 프로필 수정에서 사용하는 사용자 이름 검증 규칙을 제공합니다.
 * 프론트엔드와 동일하게 완성형 한글·영문 이름 및 제한된 단어 구분자만 허용합니다.
 */
import { z } from "zod";

export const USER_NAME_ERROR_MESSAGE =
  "이름은 한글 또는 영문으로 1~50자 입력해 주세요.";

const USER_NAME_PATTERN = /^[가-힣A-Za-z]+(?:[ '·-][가-힣A-Za-z]+)*$/u;

/**
 * 앞뒤 공백을 제거한 뒤 사용자 이름의 길이와 문자 구성을 검증합니다.
 * @remarks 이름 단어 사이의 공백, 하이픈, 아포스트로피, 가운뎃점을 허용합니다.
 */
export const userNameSchema = z
  .string({ error: USER_NAME_ERROR_MESSAGE })
  .trim()
  .min(1, { error: USER_NAME_ERROR_MESSAGE })
  .max(50, { error: USER_NAME_ERROR_MESSAGE })
  .regex(USER_NAME_PATTERN, { error: USER_NAME_ERROR_MESSAGE });
