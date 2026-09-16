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
- `tests/auth/auth-cookie.test.ts`의 기존 로컬 보강분은 이번 정리에서 수정하지 않습니다.
- API·Swagger·Schema·migration·seed·패키지는 이번 정리에서 변경하지 않습니다.

## 후속 작업

1. 쿠키 테스트 보강분을 검토하고 제출 범위를 정리합니다.
2. 현재 FE 코드와 현행 BE DTO·오류·로그아웃 응답·OAuth callback 계약을 대조합니다. 초기 문서의 FE 조사 결과는 과거 커밋 기준이며 이번에 재검증하지 않았습니다.
3. 격리된 로컬 DB와 브라우저에서 두 역할의 가입·로그인·갱신·로그아웃 및 프로필 분기를 검증합니다. 원격 DB나 seed를 임의로 실행하지 않습니다.
4. 공급자 설정을 확인한 뒤 Google·Kakao·Naver 실제 로그인과 오류 흐름을 검증합니다. 환경변수 값이나 토큰은 기록하지 않습니다.
5. 제출할 변경분에 Codex 리뷰와 CodeRabbit 리뷰를 적용하고 지적 사항을 검토합니다.

## 검증 범위

정리 후 `npm run typecheck`, `npm run build`, `npm run lint`, `npm test -- --runInBand`, `git diff --check` 결과를 확인합니다. 단위 테스트 통과만으로 실제 DB·브라우저·OAuth 연동 또는 배포 완료를 의미하지 않습니다.
