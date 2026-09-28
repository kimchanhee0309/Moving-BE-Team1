/**
 * MOVE_DAY 알림 content("내일은 {출발지 축약} → {도착지 축약} 이사 예정일이에요.")에 쓰는
 * 도로명 주소 축약 함수만 담당합니다. move-day.service.ts에서만 사용하는 순수 문자열 처리이며
 * 다른 모듈이 아직 필요로 하지 않으므로 src/common으로 올리지 않습니다(YAGNI).
 *
 * 주의: 이 축약은 "광역시도 접미사 제거 + 도로명 주소에서 뒤에서 3번째 토큰(구체 지역) 접미사
 * 제거"라는 휴리스틱이며, 완전한 한국 행정구역 사전을 사용하지 않습니다. 따라서 특이한 형태의
 * 주소(층/호수 표기, 상세주소 생략 등)에서는 완벽하지 않을 수 있습니다. "일산동구"처럼 접미사
 * 제거만으로는 자연스럽지 않은 지역명은 DISTRICT_ABBREVIATION_EXCEPTIONS에 예외로 추가해
 * 확장합니다.
 */

/**
 * tokens[0](광역시도)에서 제거할 접미사 후보입니다.
 * "특별자치시"/"특별자치도"처럼 더 긴 접미사를 먼저 확인해야 "시"/"도"로 잘못 잘리지 않습니다.
 */
const PROVINCE_SUFFIXES = [
  "특별자치시",
  "특별자치도",
  "광역시",
  "특별시",
  "자치시",
  "자치도",
  "도",
  "시",
] as const;

/** 구체 지역(구/군/시) 토큰에서 제거할 접미사 후보입니다. */
const DISTRICT_SUFFIXES = ["구", "군", "시"] as const;

/**
 * 접미사 제거만으로는 부자연스러운 구체 지역명의 예외 매핑입니다.
 * 필요한 지역이 새로 생기면 이 맵에 `{ "원본 토큰": "축약 결과" }` 형태로 추가하면 됩니다.
 */
const DISTRICT_ABBREVIATION_EXCEPTIONS: Record<string, string> = {
  일산동구: "일산",
  일산서구: "일산",
};

/**
 * 광역시도 토큰에서 접미사를 제거합니다. 매칭되는 접미사가 없으면 원본을 그대로 반환합니다.
 */
function abbreviateProvinceToken(token: string): string {
  for (const suffix of PROVINCE_SUFFIXES) {
    if (token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length);
    }
  }

  return token;
}

/**
 * 구체 지역 토큰을 축약합니다. 예외 맵을 먼저 확인하고, 없으면 접미사 하나만 제거합니다.
 */
function abbreviateDistrictToken(token: string): string {
  const exception = DISTRICT_ABBREVIATION_EXCEPTIONS[token];

  if (exception) {
    return exception;
  }

  for (const suffix of DISTRICT_SUFFIXES) {
    if (token.endsWith(suffix)) {
      return token.slice(0, token.length - suffix.length);
    }
  }

  return token;
}

/**
 * 도로명 주소를 "광역시도(구체 지역)" 형태로 축약합니다.
 *
 * 예) "경기도 고양시 일산동구 중앙로 1000" → "경기(일산)"
 *     "서울특별시 영등포구 여의대로 108" → "서울(영등포)"
 *     "세종특별자치시 도움6로 42" → "세종" (구체 지역 토큰이 없어 광역시도만 반환)
 *     "제주특별자치도 제주시 문연로 6" → "제주" (구체 지역 축약이 광역시도와 같아 괄호 생략)
 *
 * @param address 도로명 주소 전체 문자열(공백으로 구분된 토큰 형태를 가정합니다)
 * @returns 축약된 주소 문자열. 토큰이 예상 형태와 다르면 가능한 범위까지만 축약합니다.
 */
export function abbreviateAddress(address: string): string {
  const tokens = address.trim().split(/\s+/);
  const provinceToken = tokens[0] ?? "";
  const provinceAbbrev = abbreviateProvinceToken(provinceToken);

  // 도로명 주소는 보통 "광역시도 [구체지역] 도로명 번지" 형태(4토큰 이상)다.
  // 4토큰 미만이면 구체 지역을 특정할 수 없으므로 광역시도 축약만 반환한다.
  if (tokens.length < 4) {
    return provinceAbbrev;
  }

  const districtToken = tokens[tokens.length - 3] ?? "";
  const districtAbbrev = abbreviateDistrictToken(districtToken);

  // 구체 지역 축약이 비어있거나 광역시도 축약과 같으면(예: "제주" vs "제주") 중복 표기를 피한다.
  if (districtAbbrev === "" || districtAbbrev === provinceAbbrev) {
    return provinceAbbrev;
  }

  return `${provinceAbbrev}(${districtAbbrev})`;
}
