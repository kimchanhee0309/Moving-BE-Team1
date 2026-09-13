# Auth API 명세

이 문서는 이메일 Auth 구현과 Swagger의 실제 계약을 요약합니다. 모든 JSON 응답은 공통 `success/data` 또는 `success/error` 형식을 사용하며 JWT는 Body가 아닌 HttpOnly Cookie로만 전달합니다.

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
| POST | `/auth/signup` | 공개 | `201`, 사용자 DTO | `VALIDATION_ERROR`, `EMAIL_ALREADY_EXISTS`, `PHONE_ALREADY_EXISTS` |
| POST | `/auth/login` | 공개 | `200`, 사용자 DTO와 인증 쿠키 | `VALIDATION_ERROR`, `INVALID_CREDENTIALS` |
| GET | `/auth/me` | Access Cookie | `200`, 사용자 DTO | `ACCESS_TOKEN_MISSING`, `ACCESS_TOKEN_INVALID`, `ACCESS_TOKEN_EXPIRED`, `USER_NOT_FOUND` |
| POST | `/auth/refresh` | Refresh Cookie | `200`, `data: null`과 회전된 인증 쿠키 | `REFRESH_TOKEN_MISSING`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_EXPIRED` |
| POST | `/auth/logout` | 공개 | `200`, `data: null`과 쿠키 삭제 | 없음 |

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

## 이메일 로그인과 쿠키

로그인은 이메일·비밀번호·역할을 모두 확인합니다. 실패 원인을 구분해 계정 존재 여부를 노출하지 않고 `INVALID_CREDENTIALS`로 통일합니다.

| 쿠키 | Path | HttpOnly | 기본 만료 |
| --- | --- | --- | --- |
| `accessToken` | `/` | true | 30분 |
| `refreshToken` | `/auth/refresh` | true | 7일 |

Refresh 성공 시 탈취 토큰의 사용 가능 시간을 줄이기 위해 Access Token과 Refresh Token을 함께 재발급합니다. 현재는 Stateless 방식이므로 서버 DB에서 이전 Refresh Token을 즉시 폐기하거나 재사용을 탐지하지는 못합니다.

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

## OAuth 후속 작업 준비

로컬 백엔드 기본 주소가 `http://localhost:4000`일 때 공급자 콘솔에 등록할 Callback 후보는 다음과 같습니다.

```text
http://localhost:4000/auth/oauth/google/callback
http://localhost:4000/auth/oauth/kakao/callback
http://localhost:4000/auth/oauth/naver/callback
```

OAuth 구현 전에 다음 항목을 팀에서 확정합니다.

1. 각 공급자의 Client ID·Client Secret과 이메일 조회 scope
2. 로그인 시작 URI `/auth/oauth/:provider`와 위 Callback URI 등록
3. OAuth State 적용 여부와 저장·검증 방식
4. SNS가 이메일을 주지 않으면 가입을 거절할 때 사용할 화면 이동 주소와 오류 코드
5. 기존 이메일 계정과 SNS 이메일이 같을 때 자동 연결하지 않고 충돌 처리할지 여부
6. OAuth 최초 가입에서 `role`, `name`, 선택 전화번호를 받을 추가 정보 화면과 임시 식별 방식
7. 성공·실패 후 이동할 프론트엔드 URL

Secret은 `.env`에만 두며 `.env.example`, Swagger, 로그, PR 본문에는 실제 값을 작성하지 않습니다.
