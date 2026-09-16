# Auth 로컬 작업 상태와 후속 검증

갱신일: 2026-09-16

이 문서는 로컬 작업 기록이며 팀 API 계약을 새로 정의하지 않습니다. 9월 14일의 초기 제안은 Auth 구현 전 상태를 기준으로 했으므로 이 기록으로 대체합니다. 현재 계약은 [Auth API 명세](./auth-api.md), `src/modules/auth/auth.router.ts`의 Swagger, [Auth 연동 기준](./auth-integration-guide.md)을 확인합니다.

## 현재 확인한 구현

- BE 기준 커밋은 `8a7168a`이며 Auth API는 PR #7 (`ddbc9ad`)로 `dev`에 반영되어 있습니다.
- 이메일 회원가입·로그인·현재 사용자 조회·토큰 갱신·로그아웃과 Google·Kakao·Naver OAuth 시작·callback 라우트가 연결되어 있습니다.
- 비밀번호는 `src/modules/auth/password.ts`의 bcrypt 구현을 사용합니다.
- 입력 검증 함수는 `parseSignUpInput`, `parseLoginInput`이며 알 수 없는 입력 필드를 거절합니다. 공개 사용자 변환은 Service의 `toAuthUserDto`가 담당합니다.
- 회원가입·로그인·현재 사용자·토큰 갱신은 `data.user`를 반환하며, `profileCompleted`는 해당 역할의 Customer/Mover relation 존재 여부로 계산합니다.
- 로그아웃은 HTTP 200과 `{ "success": true, "data": null }`을 반환하고 두 인증 쿠키를 삭제합니다.
- Access/Refresh JWT를 HttpOnly Cookie로 전달하는 Stateless 정책입니다. DB 세션과 Refresh Token 즉시 폐기는 현재 MVP 범위에 포함하지 않습니다. 과거 AuthSession 추가 제안은 현재 작업 대상이 아닙니다.

## 이전 로컬 파일 정리

- 사용하지 않는 scrypt 구현 `src/modules/auth/auth.password.ts`를 제거했습니다. 현재 Auth Service는 `./password`만 참조합니다.
- 예전 함수명과 DTO 위치, scrypt 및 알 수 없는 필드 제거 정책을 가정한 `tests/auth-unit.test.ts`를 제거했습니다. 해당 파일은 Node test runner용이었으며 현재 Jest 실행에서 import 오류를 일으켰습니다.
- 현재 계약의 검증은 `tests/auth/auth.validator.test.ts`, `tests/auth/auth.service.test.ts`, `tests/auth/password.test.ts` 등 기존 Jest 테스트를 사용합니다. 옛 테스트의 모든 개별 경계 사례를 이전했다는 의미는 아닙니다.
- `tests/auth/auth-cookie.test.ts`의 로컬 보강분은 `8175c10`으로 커밋하여 PR #19에 포함했습니다. 실제 Express Set-Cookie 헤더로 환경별 발급·삭제 옵션과 잘못된 쿠키 입력을 검증합니다.
- API·Swagger·Schema·migration·seed·패키지는 이번 정리에서 변경하지 않습니다.

## 후속 작업

1. 쿠키 테스트 보강분의 로컬 독립 검토와 12개 단위 테스트 검증을 마쳤습니다. PR #19에서 Codex·CodeRabbit 리뷰 결과를 확인하고 필요한 피드백을 반영합니다.
2. FE 가입 폼의 일반 전화번호 허용과 BE의 휴대전화 전용 검증 차이를 정리하고 비밀번호 길이 기준을 대조합니다. OAuth callback 계약과 실제 공급자 연동은 추가 확인이 필요합니다.
3. 두 역할의 이메일 인증과 미등록 프로필 분기는 아래 환경에서 확인했습니다. 프로필 등록 완료 후 이동과 Access Token 만료에 따른 FE 자동 갱신은 후속 검증 대상입니다.
4. 공급자 설정을 확인한 뒤 Google·Kakao·Naver 실제 로그인과 오류 흐름을 검증합니다. 환경변수 값이나 토큰은 기록하지 않습니다.
5. 제출할 변경분에 Codex 리뷰와 CodeRabbit 리뷰를 적용하고 지적 사항을 검토합니다.

## 검증 범위

정리 후 `npm run typecheck`, `npm run build`, `npm run lint`, `npm test -- --runInBand`, `git diff --check` 결과를 확인합니다. 단위 테스트 통과만으로 실제 DB·브라우저·OAuth 연동 또는 배포 완료를 의미하지 않습니다.

## 로컬 브라우저 인증 연동 결과 (2026-09-16)

- 사용자 승인으로 별도 로컬 PostgreSQL 검증 DB를 생성하고 현재 Prisma 스키마를 적용했습니다. 저장소 Schema·migration·seed와 기존 DB·환경 파일은 변경하지 않았습니다. 가상 계정만 사용하며 JWT Secret은 서버 프로세스에 임시 주입했습니다.
- FE `localhost:3000`과 BE `localhost:4000`에서 실제 가입 폼을 제출했습니다. CUSTOMER는 `/customer-profile/register`, MOVER는 `/mover-profile/register`로 이동했고 `/auth/me`는 각 역할과 `profileCompleted: false`를 반환했습니다.
- 두 역할의 로그인과 `/auth/refresh` 호출이 성공했습니다. 기사 계정은 로그인 화면을 통한 재로그인과 프로필 등록 페이지 재접속 후 세션 유지도 확인했습니다. Refresh 요청 성공을 확인한 것으로, 만료 대기 및 FE 자동 재시도까지 검증한 것은 아닙니다.
- 고객은 로그아웃 API, 기사는 헤더의 로그아웃 메뉴로 쿠키를 삭제했습니다. 이후 `/auth/me`와 `/auth/refresh`는 각각 `ACCESS_TOKEN_MISSING`, `REFRESH_TOKEN_MISSING`으로 401을 반환했습니다. Stateless 정책상 복사된 토큰의 서버 측 즉시 폐기를 의미하지 않습니다.
- 고객의 잘못된 비밀번호·역할 로그인은 `INVALID_CREDENTIALS` 401, 중복 가입은 `EMAIL_ALREADY_EXISTS` 409, 프로필 미등록 견적 조회는 `PROFILE_REQUIRED` 403을 확인했습니다. 기사 계정의 고객 프로필 조회는 `ROLE_MISMATCH` 403을 반환했습니다.
- 검사한 인증 응답에 토큰·passwordHash가 없고 `document.cookie`에서 인증 토큰을 읽을 수 없음을 확인했습니다.
- FE 인증 유틸 8개와 lint는 통과했습니다. 전체 타입 검사는 기존 Dropdown 파일 누락과 빈 기사님 상세 페이지 등 담당 범위 밖 오류로 실패했으며 해당 파일은 수정하지 않았습니다.
- 실제 소셜 로그인, 프로필 등록 완료 후 분기, 운영 환경·배포 검증은 아직 수행하지 않았습니다. 이번 점검에서 인증 기능 코드 수정은 없었습니다.
