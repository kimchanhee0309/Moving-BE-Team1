# 로컬 인증 실행과 테스트

## 개발

1. `npm ci`
2. `.env.example`을 참고해 `.env`에 전용 개발 DB와 서버 origin을 설정합니다.
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm run dev` — 기본 포트 4000, Swagger `/api-docs`

현재 작업 환경은 `/private/tmp/moving-auth-pg-20260907`의 격리된 로컬 PostgreSQL(127.0.0.1:55439)을 사용합니다. 개발 DB `moving_auth_dev`, 테스트 DB `moving_auth_test`를 분리했습니다. 이 임시 DB 설정은 배포용이 아닙니다.

## 자동 테스트

`DATABASE_URL`에 이름이 `_test`로 끝나는 전용 DB URL을 설정한 후 실행합니다. 테스트가 직접 임의의 빈 포트에 HTTP 서버를 띄웁니다. 현재 환경 예:

```sh
DATABASE_URL=postgresql://apple@127.0.0.1:55439/moving_auth_test npm test
npm run typecheck
npm run build
```

새 테스트 DB에서는 먼저 `DATABASE_URL=... npx prisma migrate deploy`를 실행합니다. 테스트는 `@example.test` 계정을 생성하며 개발/운영 DB를 사용하면 안 됩니다. OAuth 테스트용 가짜 앱 값은 테스트 프로세스에만 설정합니다.

## 실제 SNS 로그인 준비

세 서비스 콘솔에 웹 앱을 등록하고 서버 `.env`에 각 `*_CLIENT_ID`, `*_CLIENT_SECRET`을 설정해야 합니다. 카카오는 REST API 키를 CLIENT_ID로 사용합니다. 프런트에는 비밀키를 설정하지 않습니다.

콜백 주소(현재 로컬):

- Google: `http://localhost:4000/auth/oauth/google/callback`
- Kakao: `http://localhost:4000/auth/oauth/kakao/callback`
- Naver: `http://localhost:4000/auth/oauth/naver/callback`

카카오의 닉네임/이메일 동의 항목은 앱 권한에 맞게 설정합니다. 이메일 미제공 시 공급자 고유 ID로 가입하며 기존 이메일 계정과 자동 연결하지 않습니다. 앱이 테스트 모드라면 사용할 계정을 테스트 사용자로 등록합니다.

콘솔 설정 후 실제 브라우저에서 각 공급자의 동의 성공/취소, 재로그인, 다른 역할 로그인 거부, 새로고침, 로그아웃을 검증해야 합니다. 현재 자동 테스트의 공급자 통신은 모의 응답이므로 실제 계정 로그인 통과를 의미하지 않습니다.

## 연동 경계

- 프로필 모듈: 실제 프로필 저장 완료 후 `User.profileCompleted`를 서버에서 갱신합니다.
- 보호 API: `requireAuth(role, true)`로 서버에서도 역할/프로필을 검증합니다.
- 다중 서버 배포 시 IP rate limiter를 공유 저장소 또는 인프라 제한으로 확장해야 합니다.
- 만료 세션/이전 토큰 이력의 운영 정리 작업을 배포 환경에 구성해야 합니다.
- 팀의 기존 auth-working-copy 초안은 현재 팀 서버 계약과 달라 복사하지 않았습니다.

공급자 공식 문서:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
- https://developers.naver.com/docs/login/api/api.md

## 실제 연동 확인 (2026-09-07)

- Naver/Kakao: 실제 사용자 동의 후 FE 홈 복귀 및 새로고침 로그인 유지 확인.
- Naver 개발 중 앱은 멤버관리에서 테스트 계정을 등록해야 합니다.
- Kakao: 로그인 활성화, REST API 키에 로컬 callback 등록, 닉네임 선택 동의 설정. 이메일 권한은 없어 공급자 ID로 가입합니다.
- Google: 콘솔 클라이언트 생성 화면 오류로 키 발급 및 실제 로그인 검증 대기.
- 실제 비밀키는 Git 제외된 백엔드 `.env`에만 보관하며 팀원별 환경 설정이 필요합니다.
