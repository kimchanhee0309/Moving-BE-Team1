# MoveRequest API 명세

## 1. API 개요

| 항목 | 작성 내용 |
| --- | --- |
| API 종류 | MoveRequest API |
| 도메인 | 일반 유저(CUSTOMER)의 이사 견적 요청 생성 |
| 담당자 | 본인 |
| 관련 모듈 | `src/modules/move-request` |
| 인증 방식 | Access/Refresh Token을 HttpOnly Cookie로 전달 (Auth 공통 경계 재사용) |
| 허용 역할 | `CUSTOMER` |
| 기능 설명 | 이사 종류·날짜·출발지·도착지를 입력해 새 이사 견적 요청을 생성하고, 현재 활성 요청을 조회하고, 이미 생성된 요청에 특정 기사님을 지정 요청으로 추가한다 |
| 관련 화면 | 채팅 형태의 이사 정보 입력(이사 종류/날짜/출발지/도착지), progress bar, 입력 수정, 기사님 지정 요청 |
| 관련 담당자 | Customer Profile, Customer Quote, Mover Request, Mover Search |

이 모듈은 일반 유저가 **새 견적 요청을 만들고, 그 요청에 기사님을 지정하는 것**까지 담당한다. 기사님이 견적 요청을 조회·응답하는 쪽은 `mover-request`/`mover-quote`, 고객이 받은 견적을 조회·확정하는 쪽은 `customer-quote`가 담당한다.

URI는 이미 병합된 `customer-quote` 모듈(`GET /customers/me/quotes`)과 `docs/auth-integration-guide.md`의 guard 예시(`/customers/me/move-requests`)를 따라 `/customers/me/move-requests` prefix로 통일한다.

---

## 2. 공통 정책

### 상태(status)

`prisma/schema.prisma`의 `MoveRequestStatus`이며 `src/config/swagger.ts`에도 동일하게 등록되어 있다.

| 값 | 의미 |
| --- | --- |
| `WAITING` | 아직 확정 전, 견적을 받고 있는 상태 |
| `CONFIRMED` | 견적 하나가 확정된 상태 (이사일 이전) |
| `COMPLETED` | 이사일이 지난 상태 |

### 활성 요청 정책

- 한 customer는 동시에 하나의 활성 요청만 가질 수 있다.
- 활성 요청은 다음 두 가지를 포함한다.
  - 확정 전 대기 중인 요청 (`status: WAITING`)
  - 확정 후 ~ 이사일 이전 상태의 요청 (`status: CONFIRMED`이고 `moveDate`가 아직 지나지 않음)
- 이사일이 지나야 새로운 견적 요청을 할 수 있다.
- 한 번의 요청에 대해 일반 견적은 최대 5명, 지정 견적은 최대 3명, 총 최대 8명의 기사님에게 견적을 받을 수 있다. 이 최대 인원 검증은 견적을 보내는 쪽(`mover-request`)과 지정 요청을 추가하는 쪽(이 모듈의 Create Designated Request)에서 수행하며, 이 모듈의 생성 API는 요청 생성 시점의 활성 요청 중복만 검증한다.

### 이사 종류(ServiceType)

이사 종류는 소형이사(원룸·투룸·20평대 미만), 가정이사(쓰리룸·20평대 이상), 사무실이사(사무실·상업공간) 3종이다.

**API 계약: `serviceType`은 UUID가 아니라 `SMALL`/`HOME`/`OFFICE` 고정 문자열 enum이다.** `prisma/schema.prisma`의 `ServiceType`은 `id`(UUID)/`name` 컬럼을 가진 테이블이지만, API 경계에서는 `name` 값(`SMALL`/`HOME`/`OFFICE`)만 주고받는다 — Service/Repository 내부에서만 이름으로 테이블을 조회해 UUID를 다룬다. 이미 병합된 `customer-quote` 모듈이 이 규칙을 그대로 구현하고 있다.

- `src/config/swagger.ts`의 공통 `ServiceType` 컴포넌트: `{ type: "string", enum: ["SMALL", "HOME", "OFFICE"] }`
- `src/modules/customer-quote/customer-quote.dto.ts`: `SERVICE_TYPE_NAMES = ["SMALL", "HOME", "OFFICE"]`, "serviceType은 UUID가 아니라 유형 이름입니다"라고 명시
- FE(`src/common/constants/domain.ts`)의 `SERVICE_TYPE.SMALL/HOME/OFFICE`와 정확히 일치

### Request 처리 흐름

의존 방향은 `Router -> Controller -> Service -> Repository/Prisma`이며, 도메인 Router는 Auth의 공통 guard(`requireProfiledCustomer`)를 그대로 사용한다. Controller는 `getProfileAuthContext(request)`로 얻은 `profileId`(=`customerId`)만 사용하고, body로 넘어온 `customerId`는 신뢰하지 않는다.

---

## 3. 엔드포인트 목록

| 메서드 | 경로 | 기능 | 설명 | 인증 | 권한 | 담당자 |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/customers/me/move-requests` | Create Move Request | 이사 견적 요청 생성 | 필요 | `CUSTOMER` | 본인 |
| GET | `/customers/me/move-requests/active` | Get Active Move Request | 현재 활성 요청 조회 | 필요 | `CUSTOMER` | 본인 |
| POST | `/customers/me/move-requests/:moveRequestId/designated-requests` | Create Designated Request | 특정 기사님에게 지정 요청 추가 | 필요 | `CUSTOMER` | 본인 |

---

## 4. 엔드포인트 상세

## API 이름: Create Move Request

### 기본 정보

| 항목 | 작성 내용 |
| --- | --- |
| API 이름 | Create Move Request |
| Method | POST |
| URI | `/customers/me/move-requests` |
| 설명 | 이사 종류·날짜·출발지·도착지를 받아 새 이사 견적 요청을 생성한다. |
| 인증 | Access Token 필요 |
| 허용 역할 | `CUSTOMER` |
| 프로필 등록 | 필요 |
| 담당자 | 본인 |
| 관련 화면 | 이사 종류/날짜/출발지/도착지 입력(채팅형, progress bar) |

### Path Parameters

| 이름 | 타입 | 필수 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| 없음 | - | - | - | - |

### Query Parameters

| 이름 | 타입 | 필수 | 기본값 | 허용값 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| 없음 | - | - | - | - | - | - |

### Request Headers·Cookies

| 구분 | 이름 | 필수 | 설명 |
| --- | --- | --- | --- |
| Header | `Content-Type: application/json` | 필수 | JSON 요청 형식 |
| Cookie | `accessToken` | 필수 | 로그인 상태에서 발급된 HttpOnly Access Token |

### Request Body

| 필드 | 타입 | 필수 | nullable | 제약조건 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `serviceType` | string | 필수 | 불가 | `SMALL`, `HOME`, `OFFICE` | 이사 종류(소형/가정/사무실 이사) | `"SMALL"` |
| `moveDate` | string | 필수 | 불가 | ISO 8601 날짜, 오늘보다 미래 | 이사 예정일 | `"2026-11-01"` |
| `fromAddress` | string | 필수 | 불가 | 공백 제거 후 1~255자, `[{zonecode}] {roadAddress} {detailAddress} ({jibunAddress})` 형식 | 출발지 전체 주소(우편번호+도로명+상세주소+지번주소를 FE가 하나의 문자열로 조합) | `"[04538] 서울시 강남구 테헤란로 123 101동 202호 (테헤란로1가 25-3)"` |
| `toAddress` | string | 필수 | 불가 | 공백 제거 후 1~255자, 동일 형식 | 도착지 전체 주소 | `"[13529] 경기도 성남시 분당구 판교역로 456 3층 (백현동 532-2)"` |

### 성공 응답

| 항목 | 작성 내용 |
| --- | --- |
| HTTP Status | `201 Created` |
| 응답 형식 | `data.moveRequest` 단건 |
| 설명 | 생성된 이사 견적 요청 정보를 반환한다. |

### 요청 예시

```
POST /customers/me/move-requests
Content-Type: application/json
Cookie: accessToken={HttpOnly Cookie}
```

```json
{
  "serviceType": "SMALL",
  "moveDate": "2026-11-01",
  "fromAddress": "[04538] 서울시 강남구 테헤란로 123 101동 202호 (테헤란로1가 25-3)",
  "toAddress": "[13529] 경기도 성남시 분당구 판교역로 456 3층 (백현동 532-2)"
}
```

### 성공 응답 예시

```json
{
  "success": true,
  "data": {
    "moveRequest": {
      "id": "00000000-0000-0000-0000-000000000000",
      "serviceType": "SMALL",
      "moveDate": "2026-11-01T00:00:00.000Z",
      "fromAddress": "[04538] 서울시 강남구 테헤란로 123 101동 202호 (테헤란로1가 25-3)",
      "toAddress": "[13529] 경기도 성남시 분당구 판교역로 456 3층 (백현동 532-2)",
      "status": "WAITING",
      "createdAt": "2026-09-15T00:00:00.000Z",
      "updatedAt": "2026-09-15T00:00:00.000Z"
    }
  }
}
```

### 가능한 오류

| HTTP Status | error.code | 발생 조건 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body가 JSON 객체가 아니거나 필수값·형식이 올바르지 않은 경우(`serviceType`이 3개 허용값 밖, 과거 날짜 포함) |
| 401 | `ACCESS_TOKEN_MISSING` | Access Token Cookie가 없는 경우 |
| 401 | `ACCESS_TOKEN_INVALID` | Access Token이 유효하지 않은 경우 |
| 401 | `ACCESS_TOKEN_EXPIRED` | Access Token이 만료된 경우 |
| 403 | `PROFILE_NOT_REGISTERED` | Customer 프로필을 등록하지 않은 경우 |
| 409 | `ACTIVE_MOVE_REQUEST_EXISTS` | 이미 활성 요청(대기 중 또는 확정 후 이사일 이전)이 있는 경우 |
| 500 | `INTERNAL_SERVER_ERROR` | 처리되지 않은 서버 또는 DB 오류가 발생한 경우(seed의 `ServiceType.name`이 3개 허용값과 어긋나 조회 실패한 경우 포함) |

---

## API 이름: Get Active Move Request

### 기본 정보

| 항목 | 작성 내용 |
| --- | --- |
| API 이름 | Get Active Move Request |
| Method | GET |
| URI | `/customers/me/move-requests/active` |
| 설명 | 현재 customer의 활성 요청을 조회한다. 새 견적 요청 화면 진입 가능 여부를 판단하는 데 사용한다. |
| 인증 | Access Token 필요 |
| 허용 역할 | `CUSTOMER` |
| 프로필 등록 | 필요 |
| 담당자 | 본인 |
| 관련 화면 | 견적 요청 시작 전 진입 가능 여부 확인 |

### Path Parameters

| 이름 | 타입 | 필수 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| 없음 | - | - | - | - |

### Query Parameters

| 이름 | 타입 | 필수 | 기본값 | 허용값 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| 없음 | - | - | - | - | - | - |

### Request Headers·Cookies

| 구분 | 이름 | 필수 | 설명 |
| --- | --- | --- | --- |
| Cookie | `accessToken` | 필수 | 로그인 상태에서 발급된 HttpOnly Access Token |

### Request Body

| 필드 | 타입 | 필수 | nullable | 제약조건 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| 없음 | - | - | - | - | - | - |

### 성공 응답

| 항목 | 작성 내용 |
| --- | --- |
| HTTP Status | `200 OK` |
| 응답 형식 | `data.moveRequest` (활성 요청이 없으면 `null`) |
| 설명 | 대기 중이거나 확정 후 이사일 이전인 요청을 반환한다. |

### 요청 예시

```
GET /customers/me/move-requests/active
Cookie: accessToken={HttpOnly Cookie}
```

### 성공 응답 예시

```json
{
  "success": true,
  "data": {
    "moveRequest": null
  }
}
```

### 가능한 오류

| HTTP Status | error.code | 발생 조건 |
| --- | --- | --- |
| 401 | `ACCESS_TOKEN_MISSING` | Access Token Cookie가 없는 경우 |
| 401 | `ACCESS_TOKEN_INVALID` | Access Token이 유효하지 않은 경우 |
| 401 | `ACCESS_TOKEN_EXPIRED` | Access Token이 만료된 경우 |
| 403 | `PROFILE_NOT_REGISTERED` | Customer 프로필을 등록하지 않은 경우 |
| 500 | `INTERNAL_SERVER_ERROR` | 처리되지 않은 서버 또는 DB 오류가 발생한 경우 |

---

## API 이름: Create Designated Request

### 기본 정보

| 항목 | 작성 내용 |
| --- | --- |
| API 이름 | Create Designated Request |
| Method | POST |
| URI | `/customers/me/move-requests/:moveRequestId/designated-requests` |
| 설명 | 이미 생성된 일반 견적 요청에 특정 기사님을 지정해서 지정 요청을 추가한다. |
| 인증 | Access Token 필요 |
| 허용 역할 | `CUSTOMER` |
| 프로필 등록 | 필요 |
| 담당자 | 본인 |
| 관련 화면 | 기사님 찾기·기사님 상세의 "지정 요청" 버튼 |

일반 견적 요청이 먼저 있어야 지정 요청이 가능하다. 지정 요청은 화면에서 라벨로 강조되어 전달된다.

### Path Parameters

| 이름 | 타입 | 필수 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| `moveRequestId` | UUID string | 필수 | 지정 요청을 추가할 대상 MoveRequest | `"00000000-0000-0000-0000-000000000000"` |

### Query Parameters

| 이름 | 타입 | 필수 | 기본값 | 허용값 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| 없음 | - | - | - | - | - | - |

### Request Headers·Cookies

| 구분 | 이름 | 필수 | 설명 |
| --- | --- | --- | --- |
| Header | `Content-Type: application/json` | 필수 | JSON 요청 형식 |
| Cookie | `accessToken` | 필수 | 로그인 상태에서 발급된 HttpOnly Access Token |

### Request Body

| 필드 | 타입 | 필수 | nullable | 제약조건 | 설명 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `moverId` | UUID string | 필수 | 불가 | 존재하는 `Mover.id` | 지정할 기사님 | `"00000000-0000-0000-0000-000000000000"` |

### 성공 응답

| 항목 | 작성 내용 |
| --- | --- |
| HTTP Status | `201 Created` |
| 응답 형식 | `data.designatedRequest` 단건 |
| 설명 | 생성된 지정 요청 정보를 반환한다. |

### 요청 예시

```
POST /customers/me/move-requests/00000000-0000-0000-0000-000000000000/designated-requests
Content-Type: application/json
Cookie: accessToken={HttpOnly Cookie}
```

```json
{
  "moverId": "00000000-0000-0000-0000-000000000000"
}
```

### 성공 응답 예시

```json
{
  "success": true,
  "data": {
    "designatedRequest": {
      "id": "00000000-0000-0000-0000-000000000000",
      "moveRequestId": "00000000-0000-0000-0000-000000000000",
      "moverId": "00000000-0000-0000-0000-000000000000",
      "createdAt": "2026-09-15T00:00:00.000Z",
      "updatedAt": "2026-09-15T00:00:00.000Z"
    }
  }
}
```

### 가능한 오류

| HTTP Status | error.code | 발생 조건 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `moverId` 형식이 올바르지 않은 경우 |
| 401 | `ACCESS_TOKEN_MISSING` | Access Token Cookie가 없는 경우 |
| 401 | `ACCESS_TOKEN_INVALID` | Access Token이 유효하지 않은 경우 |
| 401 | `ACCESS_TOKEN_EXPIRED` | Access Token이 만료된 경우 |
| 403 | `PROFILE_NOT_REGISTERED` | Customer 프로필을 등록하지 않은 경우 |
| 403 | `MOVE_REQUEST_FORBIDDEN` | 대상 MoveRequest가 본인 소유가 아닌 경우 |
| 404 | `MOVE_REQUEST_NOT_FOUND` | `moveRequestId`가 존재하지 않는 경우 |
| 404 | `MOVER_NOT_FOUND` | `moverId`가 존재하지 않는 경우 |
| 409 | `MOVE_REQUEST_ALREADY_CONFIRMED` | 이미 확정 또는 완료된 요청인 경우 |
| 409 | `DESIGNATED_REQUEST_ALREADY_EXISTS` | 이미 같은 기사님에게 지정 요청을 보낸 경우 |
| 409 | `DESIGNATED_REQUEST_LIMIT_EXCEEDED` | 지정 견적 최대 인원(3명)을 초과한 경우 |
| 500 | `INTERNAL_SERVER_ERROR` | 처리되지 않은 서버 또는 DB 오류가 발생한 경우 |

---

## 5. 프론트엔드 연동 흐름

실제 FE 구현(`src/app/(customer)/move-request/page.tsx`, `MoveRequestForm`)을 기준으로 정리한다.

### 페이지 진입 — 활성 요청 여부 분기

1. `/move-request` 페이지 진입 시 가장 먼저 `GET /customers/me/move-requests/active`로 활성 요청 여부를 확인한다.
2. 활성 요청이 있으면 입력 폼을 렌더링하지 않고 `MoveRequestBlockedState` 안내 화면만 보여준다 — "현재 진행 중인 이사 견적이 있어요! 진행 중인 이사 완료 후 새로운 견적을 받아보세요." + "받은 견적 보러가기" 버튼(대기 중인 견적 페이지로 이동).
3. 활성 요청이 없으면 실제 입력 폼(`MoveRequestForm`)을 보여준다.

### 이사 견적 요청 생성 — 반응형별 입력 방식

FE는 breakpoint별로 서로 다른 두 레이아웃을 함께 렌더링하고 CSS로 전환하며, 값 state는 하나로 공유한다.

- **모바일(744px 미만)**: 1문항-1화면 wizard. 1단계 이사 종류(소형/가정/사무실 카드 선택) → 2단계 이사 예정일(달력) → 3단계 출발지·도착지(주소 검색 모달)를 순서대로 보여주고, 상단에 1/2/3 단계 dot indicator를 표시한다. 각 단계 하단 "이전/다음" 버튼으로 이동하고, 마지막 단계에서만 "견적 요청하기" 버튼이 나타난다.
- **태블릿·데스크톱(744px 이상)**: 단계 구분 없이 이사 유형·예정일·출발지·도착지를 한 화면에 모두 보여주고, 화면 하단 "견적 요청하기" 버튼 하나로 제출한다. 별도 progress bar가 없다.
- 이미 선택한 값은 "수정하기"(주소) 또는 "이전" 버튼(모바일 wizard)으로 다시 바꿀 수 있다. 모든 값은 컴포넌트 local state로만 관리하고, **최종 제출 전까지 서버에 아무것도 저장하지 않는다**(단계별 임시 저장 API 없음).
- 이사 종류는 FE `SERVICE_TYPE.SMALL/HOME/OFFICE`를 그대로 `serviceType` 필드로 보낸다 — 별도 UUID 변환이 필요 없다.
- 주소는 공통 `AddressSearchModal`을 통해 검색·선택한다. 결과는 `AddressResult`(`zonecode`/`roadAddress`/`jibunAddress`) 형태다. 검색 결과 선택 후 "상세주소(동/호수 등)" 입력칸에 나머지를 직접 입력하고, 최종 제출 시 `[{zonecode}] {roadAddress} {detailAddress} ({jibunAddress})` 형식의 문자열 하나로 합쳐 `fromAddress`/`toAddress`로 보낸다. **상세주소 입력칸은 기존 `AddressSearchModal`/`AddressCard`에 없어 이 페이지에 새로 추가해야 한다.**
- 4개 값(`serviceType`, `moveDate`, `fromAddress`, `toAddress`)이 모두 채워져야 "견적 요청하기" 버튼이 활성화된다.
- 제출하면 `POST /customers/me/move-requests`를 호출한다. 성공하면 대기 중 견적 화면(Customer Quote)으로 이동한다.

### 기사님 지정 요청

1. 일반 견적 요청이 이미 만들어져 있어야 한다(위 흐름의 `moveRequestId` 필요).
2. 기사님 찾기·기사님 상세 화면에서 "지정 요청" 버튼을 누르면 `POST /customers/me/move-requests/:moveRequestId/designated-requests`를 호출한다.
3. 지정 견적 최대 인원(3명)을 넘으면 409를 받고 화면에 안내한다.
4. 성공하면 해당 지정 요청이 라벨로 강조되어 대기 중 견적 화면에 표시된다.

---

## 6. 다른 도메인의 Auth 사용 기준

| API 성격 | 사용할 Guard | 설명 |
| --- | --- | --- |
| 이 모듈의 전체 API | `requireProfiledCustomer` | CUSTOMER 역할과 Customer 프로필 등록 여부를 함께 확인 |

- Guard는 진입 권한(로그인 + 역할 + 프로필)만 검사한다.
- 요청이 실제로 이 customer 소유인지, 이미 확정·완료된 상태인지 같은 소유권과 상태 검증은 Service가 DB 관계로 직접 수행한다.
- Client가 body/query로 보낸 `customerId`는 신뢰하지 않고, `getProfileAuthContext(request)`가 만든 인증 주체만 사용한다.

---

## 7. API 간 충돌·협의 확인

| 확인 항목 | 확인 결과 |
| --- | --- |
| 같은 Router 또는 Service를 다른 담당자도 수정하는가? | `MoveRequest`, `Quote`, `DesignatedRequest`는 `customer-quote`, `mover-request`, `mover-quote`, `mover-search` 담당자와 테이블을 공유하므로 변경 전 협의 필요 |
| 같은 Method와 URI가 중복되는가? | `GET /customers/me/move-requests/active`가 `GET /customers/me/quotes`(Customer Quote)와 같은 정보를 일부 담을 수 있어 중복 여부 확인 필요 |
| 다른 모듈의 데이터를 조회하거나 수정하는가? | `serviceType` 이름으로 `ServiceType` 테이블 조회(내부 FK 해석), `Mover` 존재 여부 조회 |
| DTO, Enum, 상태값을 공유하는가? | Prisma `MoveRequestStatus`, 공통 `ServiceType` enum(`SMALL`/`HOME`/`OFFICE`, `customer-quote`와 동일 계약 사용) |
| 트랜잭션이 필요한가? | 요청 생성 자체는 단일 쓰기라 불필요. 활성 요청 존재 여부 확인과 생성 사이의 경쟁 조건은 DB 제약이나 짧은 transaction으로 막을지 확인 필요. 지정 요청 최대 인원(3명) 카운트+insert도 동시성 보호가 필요할 가능성 높음 |
| API 완료 후 알림 생성이 필요한가? | 필요 — 요청 생성 시 서비스 가능 지역 기사님에게 `NEW_MOVE_REQUEST`. 생성 메커니즘은 `docs/notification-api.md`의 공통 `createNotification()` 함수를 같은 transaction 안에서 호출하는 것으로 확정됐으나, **이 모듈 구현 시점에 실제로 그 호출을 붙일지는 아직 구현 전이라 대기** |
| Prisma Schema 변경이 필요한가? | 불필요 |
| 협의 대상 담당자 | Customer Quote, Mover Request, Mover Quote, Mover Search, Notification 담당자 |
| 협의 내용 | 최대 인원(5/3/8) 검증 주체, `GET /customers/me/move-requests/active`와 `GET /customers/me/quotes` 조회의 중복 여부, `moveDate`의 timezone 및 자동 완료 처리 방식. `fromAddress`/`toAddress`의 255자 제한 안에서 조합 문자열이 항상 충분한지(예외적으로 긴 상세주소 대비 실제 validator 길이 제한 문구 확정). 알림 생성 책임은 추후 별도 협의(현재 대기) |
| 최종 결정 | 미정 |
| 결정 일자 | 미정 |

---

## 8. 완료 체크리스트

| 확인 항목 | 완료 |
| --- | --- |
| 전체 엔드포인트 목록과 Method·URI가 실제 Router와 일치한다. | ☐ |
| API 이름이 영문으로 작성되어 있다. | ☑ |
| Path Parameter와 Query Parameter가 구분되어 있다. | ☑ |
| 없는 항목도 `없음`으로 작성되어 있다. | ☑ |
| Request Body와 요청 예시가 실제 Validator와 일치한다. | ☐ |
| `data.moveRequest` DTO와 응답 예시가 실제 Service 응답과 일치한다. | ☐ |
| 인증·권한·프로필 조건이 작성되어 있다. | ☑ |
| 실제 발생 가능한 오류 코드가 작성되어 있다. | ☐ |
| Swagger와 현재 구현을 기준으로 작성했다. | ☑ (`ServiceType`/`MoveRequestStatus` enum은 `src/config/swagger.ts` 기준 확정) |
| 최대 견적 인원(5/3/8) 검증 주체가 관련 담당자와 확정됐다. | ☐ |
| `moveDate` 입력 형식과 timezone 기준이 확정됐다. | ☐ |
| `GET /customers/me/move-requests/active`의 필요 여부가 Customer Quote 담당자와 확정됐다. | ☐ |
| `fromAddress`/`toAddress` 조합 형식(`[{zonecode}] {roadAddress} {detailAddress} ({jibunAddress})`)이 255자 제한 안에서 검증됐다. | ☐ |
| FE에 "상세주소" 입력칸이 추가됐다. | ☐ |

---

## 9. 구현 기준 정보

| 항목 | 결과 |
| --- | --- |
| API 구현 위치 | `src/modules/move-request` |
| 공통 인증 코드 | `src/common/cookies`, `src/common/middleware`, `src/common/utils` |
| 공유 enum 근거 | `src/config/swagger.ts`(`ServiceType`, `MoveRequestStatus`), `src/modules/customer-quote/customer-quote.dto.ts`(`SERVICE_TYPE_NAMES`) |
| Swagger 위치 | `/api-docs`, `/api-docs.json` |
| Prisma Schema 변경 | 없음 |
| Migration 변경 | 없음 |
| Seed 변경 | 없음 |
