# 팀 도메인 API의 Auth 연동 기준

이 문서는 아직 작성 중인 도메인별 API 명세를 대신 확정하지 않습니다. Auth API와 공통 응답을 먼저 안정된 계약으로 두고, 각 담당자가 자신의 URI·DTO·비즈니스 규칙을 정할 때 공통으로 재사용할 경계만 설명합니다.

## 결론

현재 구조로 고객·기사·알림 등 담당 API 개발을 시작할 수 있습니다. 각 Router는 아래 guard를 재사용하고, Controller는 검증된 인증 컨텍스트만 Service에 전달하면 됩니다. Auth 모듈을 import해 사용자나 token을 다시 조회하지 않습니다.

## 프론트와 Auth 계약

- 인증 수단은 `accessToken`, `refreshToken` HttpOnly Cookie입니다. Bearer Token이나 body의 token을 새로 만들지 않습니다.
- 프론트의 모든 API 요청은 `credentials: "include"`를 사용합니다.
- 이메일 가입·로그인·현재 사용자·갱신의 사용자 응답은 `{ success: true, data: { user } }`입니다.
- `data.user`에는 `id`, `name`, `email`, `phone`, `role`, `profileCompleted`만 포함됩니다.
- 비회원이 인증 필요 행동을 하면 역할별 로그인 화면으로 이동합니다.
- 가입 또는 OAuth callback 후 `/auth/me`를 조회하고 `profileCompleted: false`이면 역할별 프로필 등록 화면으로 이동합니다.
- 프로필 등록 완료 후 `/auth/me`를 다시 조회하면 `profileCompleted: true`가 되어 개인 페이지에 진입할 수 있습니다.

## Router guard 선택

`src/common/middleware/auth/auth-guards.ts`의 배열을 Router에 펼쳐 사용합니다.

```ts
router.post(
  "/customers/me/profile",
  ...requireCustomer,
  createCustomerProfileController,
);

router.get(
  "/customers/me/move-requests",
  ...requireProfiledCustomer,
  listMoveRequestsController,
);

router.post(
  "/movers/me/quotes",
  ...requireProfiledMover,
  createQuoteController,
);
```

| API 성격 | 사용할 guard | 이유 |
| --- | --- | --- |
| 공개 기사 목록·상세·리뷰 | 없음 | 비회원 사용자 흐름 허용 |
| 로그인 사용자 공통 기능 | `requireAuthenticated` | 역할·프로필과 무관한 인증만 확인 |
| 고객 프로필 최초 생성 | `requireCustomer` | 생성 전에는 profile이 없으므로 `requireProfile` 금지 |
| 기사 프로필 최초 생성 | `requireMover` | 생성 전에는 profile이 없으므로 `requireProfile` 금지 |
| 고객 요청·견적·찜·리뷰·마이페이지 | `requireProfiledCustomer` | CUSTOMER 역할과 Customer 존재를 모두 확인 |
| 기사 요청·견적·반려·마이페이지 | `requireProfiledMover` | MOVER 역할과 Mover 존재를 모두 확인 |
| CUSTOMER/MOVER 공통 개인 알림 조회·읽음 | `requireProfiledUser` | 로그인하고 자기 역할의 profile 등록을 완료한 두 역할 모두 허용하며 비회원은 차단 |
| OAuth callback·refresh·logout | Auth Router 전용 | 각 endpoint가 State 또는 전용 Cookie를 직접 검증 |

guard의 순서는 항상 `authenticate → authorize → requireProfile`입니다. `requireProfile`을 통과하면 DB의 현재 역할도 Token 역할과 일치하며 `request.auth.profileId`가 설정됩니다.

## Controller와 Service 경계

Controller에서는 optional인 `request.auth`를 단언하지 말고 공통 helper를 사용합니다.

```ts
const auth = getProfileAuthContext(request);
const quote = await createQuote({
  moverId: auth.profileId,
  requestId: request.params.requestId,
  body: request.body,
});

return sendSuccess(response, HTTP_STATUS.CREATED, { quote });
```

- 프로필 생성 Controller는 `getAuthContext()`의 `userId`, `role`을 Service에 전달합니다.
- 등록 완료 개인 기능은 `getProfileAuthContext()`의 `profileId`를 전달합니다.
- client가 보낸 `userId`, `customerId`, `moverId`, `role`을 현재 사용자 식별에 사용하지 않습니다.
- guard는 진입 권한만 검사합니다. “내 요청인지”, “내 견적인지”, “이미 확정됐는지” 같은 resource 소유권과 상태 전이는 반드시 각 Service가 DB 관계로 검사합니다.

## 공통 응답 형식

성공 응답은 `sendSuccess()` 또는 body가 없는 확정 endpoint에서 `sendNoContent()`를 사용합니다. 도메인 응답은 의미 있는 key로 감쌉니다.

```json
{
  "success": true,
  "data": {
    "quote": {}
  }
}
```

목록은 `data.items`처럼 담당 명세에서 key와 pagination을 확정할 수 있습니다. Auth 사용자 응답의 key만 `data.user`로 이미 고정되어 있습니다.

예상 실패는 `AppError` 계열을 던지거나 `next(error)`로 전달합니다. 직접 오류 JSON을 만들지 않습니다.

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "메시지",
    "details": [{ "field": "fieldName", "reason": "검증 사유" }]
  }
}
```

공통 응답 TypeScript 타입은 `ApiSuccessResponse<T>`, `ApiErrorResponse`로 export되어 있습니다.

## 담당자별 구현 전 체크

1. 공개·로그인·역할·프로필 필요 여부를 먼저 정합니다.
2. 위 표에서 guard 한 개를 선택해 펼쳐 적용합니다.
3. Controller에서 공통 context helper와 공통 응답 helper를 사용합니다.
4. Service에서 resource 소유권, 역할별 관계, 상태 전이, 중복을 검사합니다.
5. Repository는 필요한 필드만 조회하고 Prisma 원문을 응답에 넘기지 않습니다.
6. Swagger와 테스트에 401, 403, 소유권 실패, 중복·상태 충돌을 함께 기록합니다.

이 경계를 지키면 담당 API의 endpoint나 DTO가 나중에 확정되어도 Auth 구현을 다시 바꿀 필요가 없습니다.
