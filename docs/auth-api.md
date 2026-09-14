# Auth API 명세

이 문서는 이메일 Auth 구현과 Swagger의 실제 계약을 요약합니다. 모든 JSON 응답은 공통 `success/data` 또는 `success/error` 형식을 사용하며 JWT는 Body가 아닌 HttpOnly Cookie로만 전달합니다.

다른 담당 API에서 인증·역할·프로필 guard와 공통 응답을 적용하는 방법은 [팀 도메인 API의 Auth 연동 기준](./auth-integration-guide.md)을 따릅니다. 담당 API 명세가 작성 중이어도 이 Auth 계약을 기준으로 병렬 개발할 수 있습니다.

## 공통 사용자 DTO

| 필드 | 타입 | nullable | 설명 |
| --- | --- | --- | --- |
| `id` | UUID string | 불가 | User 식별자 |
| `name` | string | 불가 | 사용자 이름 |
| `email` | string | 불가 | 소문자로 정규화된 이메일 |
| `phone` | string | 가능 | 숫자로 정규화된 휴대전화 번호 |
| `role` | `CUSTOMER` \| `MOVER` | 불가 | 가입 역할 |
| `profileCompleted` | boolean | 불가 | 역할별 Customer/Mover relation 존재 여부 |

## 엔드포인트

| Method | URI | 인증 | 성공 | 주요 오류 |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | 공개 | `201`, `data.user`와 인증 쿠키 | `VALIDATION_ERROR`, `EMAIL_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS` |
| POST | `/auth/login` | 공개 | `200`, `data.user`와 인증 쿠키 | `VALIDATION_ERROR`, `INVALID_CREDENTIALS` |
| GET | `/auth/me` | Access Cookie | `200`, `data.user` | `ACCESS_TOKEN_MISSING`, `ACCESS_TOKEN_INVALID`, `ACCESS_TOKEN_EXPIRED`, `USER_NOT_FOUND` |
| POST | `/auth/refresh` | Refresh Cookie | `200`, `data.user`와 회전된 인증 쿠키 | `REFRESH_TOKEN_MISSING`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_EXPIRED` |
| POST | `/auth/logout` | 공개 | `200`, `data: null`과 쿠키 삭제 | 없음 |
| GET | `/auth/oauth/:provider` | 공개 | `200`, 공급자 URL 또는 `302` 이동 | `VALIDATION_ERROR`, `OAUTH_NOT_CONFIGURED`, `AUTH_RATE_LIMIT_EXCEEDED` |
| GET | `/auth/oauth/:provider/callback` | State Cookie | 프론트 `/auth/callback`으로 `302` 이동 | 오류 코드를 포함한 프론트 redirect |

## 이메일 회원가입

```json
{
  "name": "홍길동",
  "email": "user@example.com",
  "phone": "01012345678",
  "password": "Password1!",
  "role": "CUSTOMER"
}
```

- 비밀번호는 8~72바이트이며 영문, 숫자, 특수문자를 각각 포함합니다.
- 이메일은 소문자로, 전화번호는 하이픈을 제거한 숫자로 저장합니다.
- 회원가입만으로 Customer/Mover profile을 생성하지 않으므로 최초 응답의 `profileCompleted`는 `false`입니다.
- 회원가입 성공 시 로그인과 동일하게 Access/Refresh Cookie를 발급하므로 즉시 인증이 필요한 프로필 등록 API를 호출할 수 있습니다.

회원가입·로그인·현재 사용자 조회·토큰 갱신의 사용자 응답은 다음 형식으로 통일합니다.

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "00000000-0000-0000-0000-000000000000",
      "name": "홍길동",
      "email": "user@example.com",
      "phone": "01012345678",
      "role": "CUSTOMER",
      "profileCompleted": false
    }
  }
}
```

## 이메일 로그인과 쿠키

로그인은 이메일·비밀번호·역할을 모두 확인합니다. 실패 원인을 구분해 계정 존재 여부를 노출하지 않고 `INVALID_CREDENTIALS`로 통일합니다.

| 쿠키 | Path | HttpOnly | 기본 만료 |
| --- | --- | --- | --- |
| `accessToken` | `/` | true | 30분 |
| `refreshToken` | `/auth/refresh` | true | 7일 |

Refresh 성공 시 탈취 토큰의 사용 가능 시간을 줄이기 위해 Access Token과 Refresh Token을 함께 재발급하고 최신 `data.user`를 반환합니다. 현재는 Stateless 방식이므로 서버 DB에서 이전 Refresh Token을 즉시 폐기하거나 재사용을 탐지하지는 못합니다.

## 공통 오류 details

필드 검증 오류가 있을 때만 다음 배열을 포함합니다.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "요청값이 올바르지 않습니다.",
    "details": [
      { "field": "email", "reason": "올바른 이메일 형식이 아닙니다." }
    ]
  }
}
```

## OAuth 가입·로그인

지원 공급자는 `google`, `kakao`, `naver`입니다. 프론트는 역할별 가입·로그인 화면에서 다음과 같이 시작 URL을 요청합니다.

```text
GET /auth/oauth/google?role=CUSTOMER&format=json
GET /auth/oauth/kakao?role=MOVER&redirect=/requests&format=json
```

`format=json`의 성공 응답은 공통 형식입니다.

```json
{
  "success": true,
  "data": {
    "url": "https://공급자-인증-주소"
  }
}
```

`format`을 생략하면 백엔드가 공급자 인증 화면으로 바로 `302` 이동합니다. `role`은 `CUSTOMER` 또는 `MOVER`만 허용하며 `redirect`는 외부 URL, 인증 화면 경로, 역슬래시 및 제어문자가 없는 동일 사이트 경로만 허용합니다.

### 공급자 Callback

로컬 백엔드 주소가 `http://localhost:4000`일 때 공급자 콘솔에 정확히 다음 URI를 등록합니다.

```text
http://localhost:4000/auth/oauth/google/callback
http://localhost:4000/auth/oauth/kakao/callback
http://localhost:4000/auth/oauth/naver/callback
```

운영에서는 `OAUTH_CALLBACK_BASE_URL`의 HTTPS origin으로 바꿉니다. callback은 공급자 고유 ID, 이메일, 이름/닉네임만 사용하고 공급자 Access Token과 원문 응답을 저장하지 않습니다.

처리 순서는 다음과 같습니다.

1. `socialProvider + socialId`가 있으면 기존 OAuth 사용자로 로그인합니다.
2. 기존 OAuth 사용자의 역할과 시작 화면 역할이 다르면 `ROLE_MISMATCH`로 중단합니다.
3. 신규 계정인데 이메일이 없으면 `OAUTH_EMAIL_REQUIRED`로 중단합니다.
4. 같은 이메일의 기존 계정이 있으면 자동 연결하지 않고 `OAUTH_ACCOUNT_CONFLICT`로 중단합니다.
5. 신규 OAuth 사용자는 nullable password와 phone을 유지한 `User`만 만들고 역할 profile은 생성하지 않습니다.
6. 기존 Auth 유틸로 서비스 Access/Refresh JWT Cookie를 발급합니다.
7. 프론트 `/auth/callback`으로 이동하고 프론트가 `/auth/me`로 세션 및 `profileCompleted`를 확인합니다.

### OAuth State

- Node `crypto.randomBytes(32)`로 예측 불가능한 nonce를 생성합니다.
- 역할, 공급자, 선택 redirect, 10분 만료시간을 담은 문맥을 HMAC-SHA256으로 서명합니다.
- 서명 문맥은 공급자 callback 경로 전용 HttpOnly, SameSite=Lax 쿠키에만 저장합니다.
- callback에서 query nonce, 쿠키 서명, 만료, 공급자를 모두 확인합니다.
- 검증 시도 직후 쿠키를 삭제하고 소비한 nonce를 만료까지 프로세스 메모리에 기록해 같은 흐름의 재사용을 거절합니다.
- State는 로그인 JWT가 아니며 공급자 callback query의 역할이나 redirect는 신뢰하지 않습니다.

### OAuth 오류 redirect

브라우저 callback 오류는 JSON 대신 `${FRONTEND_URL}/auth/callback?error=<code>`로 이동합니다. 공급자 error description, token, stack trace, 사용자 정보는 URL에 포함하지 않습니다.

주요 코드는 `OAUTH_CANCELLED`, `OAUTH_INVALID_STATE`, `OAUTH_EMAIL_REQUIRED`, `OAUTH_ACCOUNT_CONFLICT`, `ROLE_MISMATCH`, `OAUTH_PROVIDER_ERROR`입니다.

## 보안·운영 설정

- `.env`는 Git에 포함하지 않고 `.env.example`에는 변수 이름만 둡니다.
- `CORS_ORIGINS`는 허용 프론트 origin 목록이며 `FRONTEND_URL`도 반드시 그 목록에 포함되어야 합니다.
- production의 `FRONTEND_URL`, `OAUTH_CALLBACK_BASE_URL`은 HTTPS만 허용됩니다.
- production 평문 요청은 설정된 백엔드 HTTPS origin으로 `308` 이동합니다. 실제 TLS 인증서와 종료는 배포 프록시에서 설정합니다.
- `TRUST_PROXY`는 `true`가 아니라 `false` 또는 실제 reverse proxy hop 수를 사용해 위조된 IP 헤더로 요청 제한을 우회하지 못하게 합니다.
- 로그인은 IP별 15분에 실패 5회, 회원가입은 1시간에 10회, OAuth 시작은 15분에 20회, callback과 Refresh는 각각 15분에 30회로 제한합니다.
- 현재 요청 제한 저장소는 단일 Node 프로세스 메모리입니다. 서버를 여러 인스턴스로 확장할 때는 팀이 승인한 Redis 등 공유 store로 교체해야 합니다.
- 소비된 OAuth State 기록도 단일 프로세스 메모리이므로 여러 인스턴스 배포에서는 같은 공유 store로 옮겨야 완전한 전역 일회성을 보장합니다.

필수 OAuth 환경변수는 다음과 같습니다. 실제 값은 문서·로그·Swagger에 넣지 않습니다.

```text
FRONTEND_URL
OAUTH_CALLBACK_BASE_URL
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
KAKAO_CLIENT_ID / KAKAO_CLIENT_SECRET
NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
```

### Vercel 프론트엔드와 AWS 백엔드

권장 구성은 서비스 소유 도메인의 하위 도메인을 두 플랫폼에 연결하는 방식입니다.

```text
https://app.example.com  → Vercel
https://api.example.com  → AWS
```

두 주소가 같은 상위 사이트를 사용하면 API는 cross-origin이지만 cookie 관점에서는 same-site이므로 다음 구성이 가능합니다.

```env
CORS_ORIGINS=https://app.example.com
FRONTEND_URL=https://app.example.com
OAUTH_CALLBACK_BASE_URL=https://api.example.com
COOKIE_DOMAIN=
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
TRUST_PROXY=실제_AWS_PROXY_HOP_수
```

`COOKIE_DOMAIN`은 비워 API host 전용 cookie로 제한합니다. 프론트 fetch는 반드시 `credentials: "include"`를 사용하며 현재 공통 API client에 적용되어 있습니다. OAuth 공급자 Console callback도 `https://api.example.com/auth/oauth/{provider}/callback`으로 등록합니다.

Vercel 기본 도메인과 AWS 기본 도메인을 그대로 사용하면 서로 완전히 다른 site이므로 인증 쿠키에는 `COOKIE_SAME_SITE=none`과 `COOKIE_SECURE=true`가 필요합니다. 이 방식은 브라우저의 third-party cookie 제한 영향을 받을 수 있어 장기 운영에서는 같은 서비스 도메인의 `app`/`api` 하위 도메인 구성을 우선합니다. 어느 방식이든 CORS에는 정확한 Vercel 운영 origin만 등록하고 wildcard와 credentials를 함께 사용하지 않습니다.
