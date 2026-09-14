# Moving BE Team 1 - AI 작업 규칙

이 파일은 저장소 전체에 적용한다. 사람과 모든 AI 도구는 코드·문서 수정 전에 이 파일을 처음부터 끝까지 직접 읽고 준수한다. 작업 폴더에 더 가까운 `AGENTS.md`가 있으면 함께 적용하되 상위 규칙을 우회하지 않는다.

## 0. 절대 규칙

- 시작 전에 저장소 루트, 현재 브랜치, 기존 변경, 적용되는 `AGENTS.md`를 확인한다.
- `package.json`, `tsconfig.json`, 관련 소스, Prisma Schema, 최신 API 명세와 사용자 흐름을 읽고 구현한다.
- 요구사항·API·권한·상태 전이가 불명확하거나 자료끼리 충돌하면 추측하지 말고 질문한다.
- 다른 팀원의 변경을 삭제·덮어쓰기·되돌리지 않고 요청 범위 밖 파일을 수정하지 않는다.
- API URI·Method·DTO·응답·오류 코드와 DB Schema를 임의로 변경하지 않는다.
- 새 패키지 설치, Prisma Schema·migration·seed 변경, 공통 계약 변경은 사전 승인을 받는다.
- 요청 없이 commit, push, pull, merge, rebase, branch 삭제, 배포를 실행하지 않는다.
- 실행하지 않은 검증이나 구현하지 않은 기능을 완료했다고 보고하지 않는다.

### 이 파일 보호

- 사용자가 현재 요청에서 명시적으로 허용하지 않으면 수정·이동·삭제·이름 변경하지 않는다.
- `AGENTS.override.md`나 도구별 파일로 규칙을 우회하지 않는다.
- 규칙 변경은 기능 코드와 분리하고 팀 리뷰를 받는다.
- 모든 AI 도구가 안정적으로 읽도록 핵심 규칙 위주로 작성하고 UTF-8 기준 32 KiB 미만을 유지한다.

## 1. 프로젝트와 용어

Moving은 이사 소비자와 이사 전문가를 연결하는 견적 매칭 서비스다.

- `CUSTOMER`: 화면의 일반 유저, 코드·API에서는 `customer`
- `MOVER`: 화면의 기사님, 코드·API에서는 `mover`
- `MoveRequest`: 고객의 이사 견적 요청
- `DesignatedRequest`: 특정 기사님에게 보내는 지정 요청
- `Quote`: 기사님이 제시하거나 반려한 견적
- `Favorite`: 고객이 찜한 기사님

같은 개념에 `driver`, `provider`, `client` 같은 별칭을 임의로 만들지 않는다. DB 모델, API DTO, 화면 용어가 다르면 경계에서 명시적으로 변환한다. 모든 식별자는 현재 Prisma Schema처럼 UUID 문자열로 취급한다.

## 2. 판단 우선순위

1. 현재 사용자의 명시적 요청과 인수 조건
2. 팀이 승인한 최신 Swagger/OpenAPI와 기능·사용자 흐름 명세
3. 승인된 Prisma Schema와 migration
4. 이 문서
5. 현재 저장소 설정과 구현 패턴
6. Figma, ERD, Notion 등 참고 자료

상위 자료가 하위 계약의 수정을 자동 허가하지는 않는다. 불일치를 발견하면 파일·필드·영향을 보고하고 팀 결정을 기다린다. 이미지나 과거 문서를 최신 계약으로 단정하지 않는다.

현재 Swagger와 Prisma의 `QuoteStatus`는 `PROPOSED`, `CONFIRMED`, `REJECTED`를 사용한다. 공통 enum은 한쪽만 변경하지 않고 Schema·Swagger·테스트를 함께 갱신한다.

## 3. 작업 절차

### 시작 전

1. `git rev-parse --show-toplevel`, `git status --short --branch`로 루트·브랜치·변경을 확인한다.
2. 루트부터 작업 폴더까지의 `AGENTS.md`를 모두 읽는다.
3. `package.json`, 관련 module·route, 공통 middleware·response·error, Prisma Schema를 확인한다.
4. 최신 Swagger/API 명세와 사용자 흐름을 확인하고 기존 코드를 검색한다.
5. 대상 파일, 변경 범위, 인증·DB·타 모듈 영향, 검증 방법을 정리한다.

코드 수정 전 확인한 `AGENTS.md` 경로, 적용 규칙, 작업 파일, 예상 범위, 협의 사항을 짧게 알린다. 이 파일이 없거나 읽히지 않으면 일반 작업을 중단한다. 단, 사용자가 루트 `AGENTS.md` 생성·복구를 명시한 경우만 예외다.

### 완료 전

1. 변경 파일이 요청 범위와 일치하는지 확인한다.
2. `git diff --check`와 실제 `package.json`의 검증 명령을 실행한다.
3. 실패·미실행 검증, 기존 문제, 환경 부족을 구분해 보고한다.

## 4. 기술 스택과 명령

- Node.js, Express 5, TypeScript strict/NodeNext
- PostgreSQL, Prisma 7, `@prisma/adapter-pg`
- Swagger/OpenAPI 3.0.3
- npm과 `package-lock.json`
- CORS와 HttpOnly cookie 기반 인증 경계

정확한 버전은 `package.json`과 lockfile을 따른다. 현재 명령은 다음과 같다.

```text
npm run dev              개발 서버
npm run typecheck        TypeScript 검사
npm run build            dist 빌드
npm start                빌드 결과 실행
npm run prisma:generate  Prisma Client 생성
npm run prisma:migrate   개발 migration
npm run prisma:studio    Prisma Studio
npm run lint             ESLint 검사
npm test                 Jest 단위 테스트
npm run test:watch       Jest watch 모드
npm run test:coverage    Jest coverage
npm run test:ci          직렬 실행과 coverage 검사
```

Jest는 TypeScript 단위 테스트에 사용한다. Supertest 기반 통합·E2E 테스트는 MVP 이후 팀 승인 후 추가한다. 빈 placeholder를 테스트로 보고하지 않는다. Prisma seed 명령은 `prisma.config.ts`의 `tsx prisma/seed.ts`이며 DB 데이터를 삭제·생성하므로 승인 없이 실행하지 않는다.

## 5. 실제 구조와 책임

```text
prisma/
  schema.prisma          데이터 모델
  seed.ts                개발용 seed
src/
  server.ts              DB 연결, 서버 시작·종료
  app.ts                 전역 middleware와 route 조립
  routes/                최상위 router
  modules/               기능별 도메인 코드
    auth/ customer-profile/ customer-quote/ favorite/
    move-request/ mover-mypage/ mover-profile/
    mover-quote/ mover-request/ mover-search/
    notification/ review/
  common/                둘 이상 모듈이 공유하는 코드
    constants/ cookies/ errors/ middleware/ response/ types/ utils/
  config/                env, CORS, Swagger 설정
  lib/                   Prisma 등 인프라 client
  generated/             자동 생성 코드
docs/                    프로젝트 문서
tests/                   통합·E2E 테스트
```

- 기능 코드는 `src/modules/<domain>`에 둔다.
- 한 모듈 전용 코드는 그 모듈 안에 두고 실제 공용 코드만 `src/common`으로 올린다.
- `common`은 특정 domain module을 import하지 않는다.
- `routes/index.ts`는 module router 연결만 담당한다.
- `app.ts`는 Express 조립, `server.ts`는 process와 서버 lifecycle만 담당한다.
- `src/generated`, `dist`, `node_modules`를 직접 수정하거나 commit하지 않는다.
- 빈 placeholder 파일을 구현으로 간주하거나 새 기능 이름을 임의로 바꾸지 않는다.

## 6. 모듈 계층

- Router: URI·Method 선언, middleware와 Controller 연결
- Controller: HTTP 입력 추출, DTO 전달, 공통 응답 반환
- DTO/Validator: params·query·body 파싱, 타입·형식·필수값 검증
- Service: 권한, 비즈니스 규칙, 상태 전이, transaction 경계
- Repository: Prisma query와 영속성 세부 구현

의존 방향은 `Router -> Controller -> Service -> Repository/Prisma`다.

- Router·Controller에서 Prisma를 직접 호출하지 않는다.
- Repository에 Express `Request`, `Response`, cookie, HTTP status를 전달하지 않는다.
- Controller에 핵심 권한·수량 제한·상태 전이를 넣지 않는다.
- Service는 Express 객체에 의존하지 않는다.
- 작은 기능에서 Repository를 생략하면 Service만 Prisma를 호출할 수 있다.
- 여러 쓰기가 하나의 작업이면 Prisma transaction으로 원자성을 보장한다.

권장 파일명은 `<domain>.router.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.dto.ts`, `.validator.ts`다. 팀이 확정한 기존 module 패턴이 생기면 그 패턴을 우선한다.

## 7. API와 공통 응답

- 최신 승인 명세의 URI, Method, params/query/body, DTO, 상태 코드, 오류 코드를 그대로 지킨다.
- 명세가 없거나 충돌하면 endpoint·field·enum을 추측하지 않는다.
- endpoint 이름만 있고 인증·역할·profile 필요 여부, DTO, 성공 응답, 오류 code, resource 소유권, 중복·상태 전이, 목록 조건이 확정되지 않았다면 구현하지 않고 팀 결정을 요청한다.
- 미완성 Notion·Swagger 문서를 확정된 Auth Cookie·응답·middleware 계약보다 우선하거나 빈 항목을 AI가 임의로 보완하지 않는다.
- API 변경 시 같은 작업에서 Swagger JSDoc을 갱신한다.
- Swagger UI는 `/api-docs`, JSON은 `/api-docs.json`이며 `SWAGGER_ENABLED`를 따른다.
- pagination·sort·filter의 기본값과 최대값은 validator와 Swagger에 같이 기록한다.

성공은 `sendSuccess` 또는 `sendNoContent`를 사용한다.

```json
{ "success": true, "data": {} }
```

- Auth의 회원가입·로그인·현재 사용자·토큰 갱신만 `data.user`를 사용한다.
- 다른 도메인은 `data.quote`, `data.moveRequest`, `data.items`처럼 확정 명세의 의미 있는 key를 사용하며 모든 응답을 `data.user`로 만들지 않는다.
- Controller가 성공·오류 JSON을 직접 조립하지 않고 공통 response helper와 전역 error handler를 사용한다.

예상 오류는 `AppError` 계열로 전달하여 전역 error handler가 다음 형태로 응답하게 한다.

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "메시지",
    "details": [{ "field": "email", "reason": "이메일 형식 오류" }]
  }
}
```

- 입력 오류는 필요한 경우 `{ "field": string, "reason": string }[]` 형태의 `details`를 제공한다.
- stack, SQL, Prisma 원문, token, cookie, 개인정보를 응답·로그에 노출하지 않는다.
- 의미에 따라 201·204·400·401·403·404·409를 사용하되 확정 명세가 우선이다.
- Prisma model을 응답 DTO로 그대로 노출하지 않고 password hash와 내부 필드를 제외한다.

## 8. 인증·인가와 보안

현재 앱 경계는 Access/Refresh Token을 `accessToken`, `refreshToken` 이름의 HttpOnly cookie로 전달한다.

- cookie 설정·조회·삭제는 `src/common/cookies/auth-cookie.ts`를 사용한다.
- `secure`, `sameSite`, `domain`, `path`, `maxAge` 환경 설정을 유지한다.
- CORS allowlist와 `credentials: true`, `csrfOriginGuard`를 우회하지 않는다.
- token을 JSON, query string, log, error message에 넣지 않는다.
- 비밀번호는 평문 저장·로그·응답을 금지하고 검증된 hash만 저장한다.
- client가 보낸 user ID나 role을 신뢰하지 않고 인증 주체와 DB 관계에서 결정한다.
- middleware는 인증·role 진입을, Service는 profile·resource 소유권·상태를 검증한다.
- 도메인 Router는 Cookie·JWT를 다시 해석하지 않고 `requireAuthenticated`, `requireCustomer`, `requireMover`, `requireProfiledCustomer`, `requireProfiledMover`, `requireProfiledUser` 중 목적에 맞는 공통 guard를 펼쳐 사용한다.
- profile 최초 생성에는 역할 guard만 사용하고 `requireProfile` 또는 profiled guard를 적용하지 않는다. profile 등록 이후 개인 기능에는 역할별 profiled guard를 사용한다.
- Controller는 `request.auth`를 강제 단언하지 않고 `getAuthContext(request)` 또는 `getProfileAuthContext(request)`를 사용한다. `profileId`는 `requireProfile` 통과 이후에만 사용한다.
- CUSTOMER는 자신의 요청·견적·찜·리뷰만 변경할 수 있다.
- MOVER는 자신의 profile과 허용된 요청·견적만 변경할 수 있다.

- 일반 이메일 비밀번호는 `bcrypt`로 해싱하며 평문과 hash를 로그·응답에 노출하지 않는다.
- 이메일 회원가입 성공 시 Access/Refresh Token을 HttpOnly Cookie로 발급하고 모든 사용자 응답은 `data.user` 형식을 사용한다.
- JWT는 HS256과 Access/Refresh 전용 Secret을 사용하고 Access Token은 30분, Refresh Token은 7일로 발급한다.
- Refresh API는 Stateless 정책 안에서 Access/Refresh Token을 모두 회전한다. DB session·token 저장과 즉시 폐기는 MVP 범위에 포함하지 않는다.
- `profileCompleted`는 `User` 필드를 추가하지 않고 역할에 해당하는 `Customer` 또는 `Mover` relation 존재 여부로 계산한다.
- Google·Kakao·Naver OAuth는 공급자별 callback과 공통 State 정책을 유지하며 새 공급자는 같은 보안 경계를 따른다.

OAuth 가입·로그인은 다음 정책을 함께 지킨다.

- 고객 가입 화면은 `CUSTOMER`, 기사 가입 화면은 `MOVER`로 시작하며 서버가 두 역할 외 값을 거절한다.
- OAuth State는 짧은 만료시간, 위변조 검증, callback 일치 확인, 소비 후 쿠키 삭제를 모두 적용한다.
- 공급자가 이메일을 주지 않은 신규 사용자는 만들지 않고, 같은 이메일 계정을 자동 병합하지 않으며 `OAUTH_ACCOUNT_CONFLICT`로 종료한다.
- callback 최초 가입에서는 `User`만 만들고 `Customer`/`Mover`는 역할별 프로필 등록 API가 생성한다. 프로필 등록 API에는 `requireProfile`을 적용하지 않는다.
- OAuth Client Secret과 공급자 Token을 commit·응답·로그에 넣지 않으며 공급자 Token을 DB에 영구 저장하지 않는다.
- 요청 제한 store와 소비된 OAuth State nonce 기록은 현재 단일 Node 프로세스 메모리용이다. 다중 인스턴스 배포 전에 팀이 승인한 Redis 등 공유 store로 교체하며, 교체 전에는 전역 제한·일회성을 완전히 보장한다고 보고하지 않는다.

Token 정책을 바꾸거나 DB 기반 refresh 폐기를 추가할 때는 팀 명세, 환경변수, Swagger, 테스트를 함께 갱신한다.

## 9. 사용자 흐름과 비즈니스 규칙

서버가 최종 검증자다. 프론트에서 버튼을 숨기거나 client 값을 검증한 것으로 권한·제한을 대신하지 않는다.

- 가입·로그인 후 `CUSTOMER`와 `MOVER` role 및 역할별 profile 존재 여부를 확인한다.
- MoveRequest는 customer 소유권, 날짜, 서비스 유형, 현재 status를 검증한다.
- Mover의 요청 조회·견적 생성은 role, profile, 서비스 유형, 가능 지역, 지정 여부, 요청 상태를 검증한다.
- Quote 확정은 해당 customer의 요청인지 확인하고 중복 확정과 경쟁 요청을 transaction으로 막는다.
- 허용된 상태 전이만 처리하고 이미 확정·완료된 작업의 재처리는 확정된 409 오류 계약으로 거절한다.
- Favorite는 `(customerId, moverId)` 중복을 허용하지 않는다.
- Review는 완료 요청, 작성 customer, 확정 mover의 관계와 `moveRequestId`당 한 건을 검증한다.
- Notification 조회·읽음 처리는 인증된 user 소유 데이터로 제한한다.

활성 요청 수, 일반·지정 견적 최대 수, 리뷰 작성 시점 같은 수치 규칙은 프론트 문서만으로 확정하지 않는다. 최신 백엔드 요구사항이 확정되면 상수, Service 검증, 오류 코드, Swagger, 테스트를 함께 반영한다.

## 10. Prisma, seed와 데이터

- `prisma/schema.prisma`, migration, seed는 승인 없이 수정하지 않는다.
- Schema 변경 전 API, 기존 데이터, 관계, index, 삭제 정책, 배포 순서를 검토한다.
- 승인된 Schema 변경은 migration과 Client 재생성을 포함하며 생성 결과는 편집하지 않는다.
- `db push`, `migrate reset`, DB drop·truncate, 운영 migration을 승인 없이 실행하지 않는다.
- seed는 `@seed.moving.local` 사용자를 먼저 삭제하므로 실행 전 대상 DB와 영향 범위를 확인한다.
- N+1, 무제한 목록, 필요 이상의 column·relation 조회를 피한다.
- 날짜와 이사일의 timezone 기준을 명세로 확정하고 일관되게 직렬화한다.

## 11. 환경변수

- 환경변수 접근과 검증은 `src/config/env.ts`를 통한다.
- `.env`, DB URL, token·OAuth secret, 개인키를 commit·log·문서 예시에 넣지 않는다.
- 새 변수에는 실제 비밀값이 아닌 안전한 placeholder를 담은 추적 가능한 `.env.example`이 필요하다.
- production에서 빈 CORS origin이나 `SameSite=None`과 insecure cookie 조합을 허용하지 않는다.

현재 변수: `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGINS`, `FRONTEND_URL`, `OAUTH_CALLBACK_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_ISSUER`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `ACCESS_TOKEN_MAX_AGE_MS`, `REFRESH_TOKEN_MAX_AGE_MS`, `TRUST_PROXY`, `SWAGGER_ENABLED`.

## 12. 네이밍, TypeScript와 필수 주석

- 변수·함수 `camelCase`, class·type·interface·enum `PascalCase`, 상수 `UPPER_SNAKE_CASE`.
- boolean은 `is/has/can/should`, 함수는 동사로 시작한다.
- 폴더와 파일은 현재 백엔드 관례인 lowercase `kebab-case`를 사용한다.
- double quote, semicolon, trailing comma, `import type`을 유지한다.
- `any`, `@ts-ignore`, 근거 없는 assertion과 non-null assertion을 사용하지 않는다.
- 외부 입력은 `unknown`에서 검증하고 params·query 문자열 변환 실패를 처리한다.
- 생성하거나 수정한 모든 기능 파일에는 한국어 주석을 반드시 작성한다. 파일 상단에는 담당 기능, 계층의 책임, 주요 처리 흐름, 의존 대상과 담당하지 않는 범위를 설명한다.
- export 함수·class·middleware에는 JSDoc으로 목적, parameter, 반환값, 발생 가능한 오류와 DB·cookie·token 같은 부수 효과를 구체적으로 적는다.
- Router·Controller·Service·Repository에는 입력 검증 → 인증·인가 → 비즈니스 규칙·상태 전이 → DB 처리 → 응답의 해당 단계를 주석으로 구분한다.
- 복잡한 조건, 예외, transaction, 동시성, 보안, Prisma query에는 무엇을 하는지뿐 아니라 왜 필요한지와 실패 시 동작을 가까운 위치에 설명한다.
- DTO·enum·상수에는 API 필드의 의미, 허용값, 단위, nullable 여부와 제한을 적고, 테스트에는 시나리오·사전 조건·기대 결과를 적는다.
- 코드 한 줄을 그대로 읽는 주석만 반복하는 것은 상세 주석으로 인정하지 않는다. 구현 변경 시 주석도 함께 갱신하고 낡은 주석은 제거한다.
- `TODO`에는 미확정 계약, 확인 담당과 제거 조건을 적는다. 임시 구현을 완료로 보고하거나 주석에 비밀정보를 남기지 않는다.

## 13. 테스트와 검증

현재 단위 테스트 도구는 Jest와 ts-jest다. 새 테스트 도구와 Supertest는 승인 없이 설치하지 않는다. 정상 흐름 외에 다음을 검증한다.

- 도메인 테스트는 `tests/<domain>/`에 배치하고 Auth는 `tests/auth/`를 사용한다. `tests/setup-env.ts`는 루트에 유지하며 실제 OAuth Secret·Token·개인정보 대신 공급자 통신 경계를 mock한다.

- DTO 실패, 401, role·소유권 403, 없음 404, 중복·상태 충돌 409
- CUSTOMER/MOVER 경계와 다른 사용자의 resource 접근
- transaction rollback, 동시 확정·중복 생성
- pagination·filter·sort 경계와 민감정보 제외

현재 최소 검증은 `npm run typecheck`, `npm run build`, `npm run lint`, `npm test`, `git diff --check`다. API 변경 시 Swagger와 실제 응답도 대조한다. DB 검증을 못 하면 필요한 환경과 미검증 범위를 보고한다.

## 14. Git과 PR

- 기준 `dev`, 배포 `main`, 기능 브랜치 `feat/<lowercase-kebab-case>`.
- 최신 `dev`에서 분기하되 기존 변경을 임의 stash·reset·rebase하지 않는다.
- 커밋은 `feat|fix|refactor|docs|chore: 설명` 형식으로 논리 변경 하나만 담는다.
- 문서만 변경하면 `docs`, 기능은 `feat`, 버그는 `fix`를 사용한다.
- PR 대상은 `dev`; 작업·API/DB 영향·검증·미검증·리뷰 포인트를 적는다.
- `git push --force`, `git reset --hard`는 금지한다.

## 15. 완료 보고

1. 생성·수정·삭제한 파일과 구현 기능
2. 적용 API 경로·Method 및 권한·상태 전이·Swagger 변경
3. 실행한 typecheck·build·test와 실제 결과
4. 미검증 부분과 필요한 환경
5. Schema·migration·seed 수정 여부
6. 보존한 기존 변경과 범위 밖 문제
7. 팀이 추가로 확정할 계약
