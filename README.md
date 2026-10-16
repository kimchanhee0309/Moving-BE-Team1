<h1 align="center">무빙 (Moving)</h1>

<p align="center">
  이사 서비스를 요청하는 고객과 전문 기사님을 연결하는 견적 매칭 플랫폼
</p>

<p align="center">
  <a href="https://moving.it.kr"><strong>서비스 바로가기</strong></a>
  ·
  <a href="https://api.moving.it.kr/api-docs"><strong>Swagger API 문서</strong></a>
  ·
  <a href="https://github.com/kimchanhee0309/Moving-BE-Team1"><strong>Backend Repository</strong></a>
</p>

---

## 목차

1. [프로젝트 소개](#1-프로젝트-소개)
2. [기능 구현 영상](#2-기능-구현-영상)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [기술 스택](#4-기술-스택)
5. [주요 라이브러리](#5-주요-라이브러리)
6. [팀 소개 및 문서](#6-팀-소개-및-문서)
7. [개인별 주요 작업 내역](#7-개인별-주요-작업-내역)
8. [프로젝트 구조](#8-프로젝트-구조)
9. [주요 기능 상세](#9-주요-기능-상세)
10. [성능 및 사용자 경험 개선](#10-성능-및-사용자-경험-개선)
11. [트러블 슈팅](#11-트러블-슈팅)
12. [프로젝트 실행 방법](#12-프로젝트-실행-방법)
13. [향후 개선 계획](#13-향후-개선-계획)

---

## 1. 프로젝트 소개

### 무빙이란?

무빙은 이사를 준비하는 고객과 전문 이사 기사님을 연결해 주는 양방향 견적 매칭 플랫폼입니다.

고객은 이사 종류, 출발지, 도착지, 이사 날짜를 등록하고 여러 기사님으로부터 견적을 받을 수 있습니다. 기사님은 본인이 제공할 수 있는 서비스와 지역에 해당하는 요청을 확인한 뒤 견적을 보내거나 요청을 반려할 수 있습니다.

### 개발 기간

- 2026.08 ~ 2026.10
- MVP 개발부터 AWS/Vercel 배포까지 진행

### 배포 주소

| 구분 | 주소 |
| --- | --- |
| Frontend | https://moving.it.kr |
| Backend API | https://api.moving.it.kr |
| Swagger UI | https://api.moving.it.kr/api-docs |
| FE Repository | https://github.com/kimchanhee0309/Moving-FE-Team1 |
| BE Repository | https://github.com/kimchanhee0309/Moving-BE-Team1 |

### 주요 사용자

- 일반 고객
  - 이사 견적 요청
  - 기사님 검색 및 지정 견적 요청
  - 받은 견적 비교 및 확정
  - 찜한 기사님 관리
  - 이사 완료 후 리뷰 작성

- 기사님
  - 서비스 가능 지역과 서비스 종류 설정
  - 받은 이사 요청 조회
  - 견적 발송 및 요청 반려
  - 확정된 견적과 반려 요청 관리
  - 마이페이지 및 리뷰 조회

---

## 2. 시스템 아키텍처
<img width="1672" height="941" alt="시스템 아키텍쳐" src="https://github.com/user-attachments/assets/560905d3-64eb-4cfd-b6f4-1b9b2b4ec0e0" />


### 요청 흐름

1. 사용자는 `moving.it.kr`을 통해 Vercel에 배포된 Next.js 애플리케이션에 접근합니다.
2. API 요청은 `api.moving.it.kr` 도메인을 통해 AWS ALB로 전달됩니다.
3. ALB에서 HTTPS를 종료하고 EC2 내부의 Nginx로 HTTP 요청을 전달합니다.
4. Nginx는 PM2로 실행 중인 Express 서버에 요청을 전달합니다.
5. Express 서버는 Prisma를 통해 RDS PostgreSQL에 접근합니다.
6. 프로필 이미지는 S3에 저장하고 CloudFront를 통해 제공합니다.

---

## 4. 기술 스택

### Frontend

<p>
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000000" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/TanStack_Query-5-FF4154?logo=reactquery&logoColor=white" alt="TanStack Query" />
  <img src="https://img.shields.io/badge/Zod-4-3E67B1?logo=zod&logoColor=white" alt="Zod" />
</p>

### Backend

<p>
  <img src="https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/JWT-000000?logo=jsonwebtokens&logoColor=white" alt="JWT" />
  <img src="https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white" alt="Jest" />
</p>

### Deployment & Infrastructure

<p>
  <img src="https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white" alt="Vercel" />
  <img src="https://img.shields.io/badge/AWS_EC2-FF9900?logo=amazonec2&logoColor=white" alt="EC2" />
  <img src="https://img.shields.io/badge/AWS_RDS-527FFF?logo=amazonrds&logoColor=white" alt="RDS" />
  <img src="https://img.shields.io/badge/AWS_S3-569A31?logo=amazons3&logoColor=white" alt="S3" />
  <img src="https://img.shields.io/badge/CloudFront-8C4FFF?logo=amazonwebservices&logoColor=white" alt="CloudFront" />
  <img src="https://img.shields.io/badge/Nginx-009639?logo=nginx&logoColor=white" alt="Nginx" />
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white" alt="GitHub Actions" />
</p>

### Collaboration

<p>
  <img src="https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white" alt="GitHub" />
  <img src="https://img.shields.io/badge/Notion-000000?logo=notion&logoColor=white" alt="Notion" />
  <img src="https://img.shields.io/badge/Figma-F24E1E?logo=figma&logoColor=white" alt="Figma" />
  <img src="https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white" alt="Discord" />
</p>

---

## 5. 주요 라이브러리

### Frontend

| 라이브러리 | 사용 목적 |
| --- | --- |
| `@tanstack/react-query` | 서버 상태 관리, 캐싱, 재요청, 무한 스크롤 |
| `zod` | API 응답 및 입력 데이터 검증 |
| `next-intl` | Locale 기반 다국어 처리 |
| `motion` | UI 인터랙션과 애니메이션 |
| `pretendard` | 서비스 공통 웹 폰트 |
| `tailwindcss` | 디자인 시스템과 반응형 UI 구현 |

### Backend

| 라이브러리 | 사용 목적 |
| --- | --- |
| `express` | REST API 서버 구현 |
| `@prisma/client` | PostgreSQL ORM |
| `bcrypt` | 비밀번호 해시 및 검증 |
| `jsonwebtoken` | Access Token과 Refresh Token 발급 및 검증 |
| `cookie-parser` | HttpOnly 인증 쿠키 처리 |
| `cors` | 허용된 프론트엔드 Origin 관리 |
| `zod` | 요청 Query, Params, Body 검증 |
| `swagger-ui-express` | Swagger API 문서 제공 |
| `jest`, `ts-jest` | 단위 테스트 및 서비스 테스트 |
| `multer`, `sharp` | 이미지 업로드와 이미지 처리 |
| `@aws-sdk/client-s3` | S3 파일 저장 |
| `@aws-sdk/client-cloudfront` | CloudFront 캐시 무효화 |
| `nodemailer` | 이메일 인증 및 안내 메일 발송 |
| `express-rate-limit` | 인증 및 주요 API 요청 제한 |

---

## 6. 팀 소개 및 문서

### 팀원 구성

| 이름 | 담당 기능 |
| --- | --- |
| 김찬희 | 팀장, 공통 초기 설정, 받은 요청, 기사님 견적 관리, AWS 배포 |
| 김지훈 | 인증, 랜딩 페이지, 고객·기사 프로필, 기사님 마이페이지 |
| 노진우 | 견적 요청, GNB, 알림 |
| 이영주 | 기사님 찾기, 기사님 상세 |
| 조민성 | 찜한 기사님, 리뷰 |
| 권태현 | 일반 고객 견적 관리 |

> 기존 인증 및 랜딩 담당자의 중도 탈퇴 이후 해당 기능은 김지훈이 이어서 담당했습니다.

### 프로젝트 문서

| 문서 | 링크 |
| --- | --- |
| 팀 Notion | [바로가기](https://app.notion.com/p/99e6ff7cc5d882cf92c801fd84248bc2?v=8c26ff7cc5d882f6926008b26023b345) |
| API 명세서 | [바로가기](https://app.notion.com/p/API-93a6ff7cc5d883d4b3fe0178fe05aaf4) |
| Task List | [바로가기](https://app.notion.com/p/Task-list-3ca6ff7cc5d880a09255c800254cd337) |
| Figma | [바로가기](https://www.figma.com/design/fgvdOrZSUPdiBm3OwVPmCm/-%EC%8A%A4%ED%94%84%EB%A6%B0%ED%84%B0-%EA%B3%B5%EC%9C%A0%EC%9A%A9--%EB%AC%B4%EB%B9%99_V2?node-id=1-82&m=dev) |
| Swagger UI | [바로가기](https://api.moving.it.kr/api-docs) |

---

## 7. 개인별 주요 작업 내역

<details>
<summary><strong>김찬희 — 팀장 / 받은 요청 / 기사님 견적 관리 / 배포</strong></summary>

### Frontend

- Next.js App Router 기반 프로젝트 초기 구조 설계
- 공통 폴더, Provider, API Client, 환경변수 구조 구성
- 디자인 토큰, Pretendard 폰트, 공통 UI 기반 구성
- 기사님 받은 요청 목록 구현
- 견적 보내기 및 요청 반려 모달 구현
- 기사님이 보낸 견적 목록 및 확정 견적 상세 구현
- 반려한 요청 목록 구현
- TanStack Query 기반 무한 스크롤 및 Mutation 연동
- 모바일, 태블릿, 데스크톱 반응형 UI 대응
- API 오류, 빈 상태, 초기 로딩 및 추가 페이지 로딩 상태 처리

### Backend

- Express 애플리케이션 초기 구조와 공통 에러 처리 구성
- Prisma Schema와 Seed 데이터 구성
- 받은 요청 조회 API 구현
- 견적 발송 및 요청 반려 API 구현
- 기사님 견적 목록, 상세, 반려 요청 조회 API 구현
- Zod 요청 검증과 Jest 테스트 적용
- Swagger 문서 구성
- AWS EC2, RDS, ALB, Route 53, S3, CloudFront 배포 구성
- Nginx 및 PM2 기반 운영 서버 구성

</details>

<details>
<summary><strong>김지훈 — 인증 / 랜딩 / 프로필 / 마이페이지</strong></summary>

### Frontend

- 일반 고객 및 기사님 회원가입·로그인 화면 구현
- OAuth 로그인 흐름 구현
- 랜딩 페이지 구현
- 고객 프로필 등록 및 수정 구현
- 기사님 프로필 등록 및 수정 구현
- 기사님 마이페이지 구현
- 프로필 이미지 업로드 연동

### Backend

- 이메일 회원가입 및 로그인 구현
- Access/Refresh JWT 발급 및 검증
- HttpOnly Cookie 기반 인증 처리
- `/auth/me`, `/auth/refresh`, `/auth/logout` 구현
- Google, Kakao, Naver OAuth 연동
- 이메일 인증 및 비밀번호 재설정 구현
- 고객·기사 프로필 API 구현

</details>

<details>
<summary><strong>노진우 — 견적 요청 / GNB / 알림</strong></summary>

### Frontend

- 이사 견적 요청 입력 화면 구현
- 주소, 서비스 종류, 이사 날짜 입력 흐름 구현
- 역할별 GNB 구성
- 알림 목록과 읽음 상태 UI 구현
- SSE 기반 실시간 알림 연동

### Backend

- 견적 요청 등록 API 구현
- 견적 요청 상태 관리
- 알림 생성 및 조회 API 구현
- SSE 알림 스트림 구현

</details>

<details>
<summary><strong>이영주 — 기사님 찾기 / 기사님 상세</strong></summary>

### Frontend

- 기사님 목록 조회 화면 구현
- 서비스 및 지역 필터 구현
- 기사님 정렬과 검색 기능 구현
- 기사님 상세 페이지 구현
- 지정 견적 요청 흐름 연결

### Backend

- 기사님 목록 및 상세 조회 API 구현
- 지역·서비스 조건 검색 구현
- 정렬 및 페이지네이션 구현
- 기사님 평점과 견적 관련 통계 제공

</details>

<details>
<summary><strong>조민성 — 찜한 기사님 / 리뷰</strong></summary>

### Frontend

- 찜한 기사님 목록 구현
- 기사님 찜 등록 및 해제 인터랙션 구현
- 작성 가능한 리뷰 목록 구현
- 리뷰 작성 및 작성 완료 목록 구현

### Backend

- 찜 목록 조회, 등록, 해제 API 구현
- 작성 가능한 리뷰 조회 API 구현
- 리뷰 등록 및 조회 API 구현
- 리뷰 중복 작성 방지 처리

</details>

<details>
<summary><strong>권태현 — 일반 고객 견적 관리</strong></summary>

### Frontend

- 대기 중인 견적 목록 구현
- 받은 견적 상세 페이지 구현
- 견적 확정 기능 구현
- 과거 견적 목록 및 상세 구현
- 견적 상태별 화면과 예외 상태 처리

### Backend

- 고객이 받은 견적 목록 조회 API 구현
- 견적 상세 조회 API 구현
- 견적 확정 API 구현
- 과거 견적 목록 및 상세 조회 API 구현

</details>

---

## 8. 프로젝트 구조

```text
moving-fe-team1/
├─ public/
│  ├─ fonts/                       # Pretendard 폰트
│  └─ icons/                       # 서비스 공통 아이콘
│
├─ src/
│  ├─ app/
│  │  └─ [locale]/                 # Locale 기반 App Router
│  │     ├─ (public)/              # 비로그인 접근 가능 페이지
│  │     ├─ (auth)/                # 로그인 및 회원가입
│  │     ├─ (customer)/            # 일반 고객 전용 페이지
│  │     └─ (mover)/               # 기사님 전용 페이지
│  │
│  ├─ common/
│  │  ├─ api/                      # 공통 API Client
│  │  ├─ auth/                     # 인증 관련 공통 코드
│  │  ├─ components/               # Button, Input, Modal 등 공통 UI
│  │  ├─ constants/                # Route, 환경변수, 상수
│  │  ├─ hooks/                    # 공통 Hook
│  │  ├─ notification/             # 공통 알림 처리
│  │  ├─ utils/                    # 공통 Utility
│  │  └─ validation/               # 공통 검증 Schema
│  │
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ customer-profile/
│  │  ├─ customer-quote/
│  │  ├─ favorite/
│  │  ├─ landing/
│  │  ├─ move-request/
│  │  ├─ mover-mypage/
│  │  ├─ mover-profile/
│  │  ├─ mover-quote/
│  │  ├─ mover-requests/
│  │  ├─ mover-search/
│  │  ├─ notification/
│  │  └─ review/
│  │
│  ├─ i18n/                        # 다국어 설정
│  ├─ providers/                   # Query, Auth, Modal Provider
│  └─ styles/                      # Global CSS와 디자인 토큰
│
├─ next.config.ts
├─ package.json
└─ README.md
```

### 구조 설계 기준

- `app`: URL과 페이지 조합을 담당합니다.
- `features`: 기능별 API, 타입, Hook, UI를 관리합니다.
- `common`: 특정 도메인에 종속되지 않는 공통 코드를 관리합니다.
- `providers`: 애플리케이션 전체에서 사용하는 Context와 Provider를 관리합니다.
- 페이지 컴포넌트에 비즈니스 로직을 집중시키지 않고 feature 단위로 분리했습니다.

---

## 9. 주요 기능 상세

### 9.1 인증 및 인가

- 일반 고객과 기사님 역할을 구분한 회원가입
- 이메일 로그인 및 OAuth 로그인
- Access Token과 Refresh Token을 HttpOnly Cookie로 관리
- Access Token 만료 시 Refresh API를 통한 재발급
- 역할과 프로필 등록 상태에 따른 페이지 접근 제어
- 이메일 인증 및 비밀번호 재설정
- 요청 Origin 검사와 인증 API Rate Limit 적용

### 9.2 견적 요청

- 서비스 종류 선택
  - 소형 이사
  - 가정 이사
  - 사무실 이사
- 출발지와 도착지 설정
- 이사 날짜 설정
- 활성화된 견적 요청 중복 생성 방지
- 지정 기사님에 대한 지정 견적 요청 지원

### 9.3 기사님 찾기

- 기사님 목록 및 상세 정보 조회
- 지역과 서비스 종류에 따른 필터
- 평점, 경력, 확정 건수 등 기사님 정보 제공
- 기사님 찜 등록 및 해제
- 기사님에게 지정 견적 요청

### 9.4 일반 고객 견적 관리

- 대기 중인 견적 목록 조회
- 견적별 기사님, 가격, 코멘트 확인
- 견적 확정
- 완료 및 과거 견적 조회
- 확정 견적을 기반으로 리뷰 작성

### 9.5 기사님 받은 요청

- 기사님의 서비스 종류와 가능 지역에 해당하는 요청 조회
- 요청 등록일 및 이사 날짜 기준 정렬
- 견적 금액과 코멘트를 포함한 견적 발송
- 반려 사유를 포함한 요청 반려
- 중복 견적 및 중복 반려 방지
- 요청별 견적 가능 인원 제한 처리

### 9.6 기사님 견적 관리

- 보낸 견적 목록 조회
- 확정된 견적 상태 확인
- 견적 상세 조회
- 반려한 요청 목록 조회
- 이사 완료 상태에 따른 카드 오버레이 제공

### 9.7 찜 및 리뷰

- 찜한 기사님 목록 조회
- 찜 등록 및 해제
- 작성 가능한 리뷰와 작성한 리뷰 구분
- 평점과 리뷰 내용 등록
- 동일 견적에 대한 중복 리뷰 방지

### 9.8 실시간 알림

- SSE를 통한 실시간 알림 수신
- 새로운 견적, 견적 확정 등 주요 이벤트 알림
- 알림 읽음 처리
- 브라우저 재연결 상황 대응

### 9.9 프로필 이미지

- 이미지 형식과 크기 검증
- 이미지 최적화 처리
- S3 저장
- CloudFront를 통한 이미지 제공
- 이미지 교체 시 기존 객체 삭제 및 캐시 무효화

---

## 10. 성능 및 사용자 경험 개선

<details>
<summary><strong>10.1 폰트·이미지 로딩 최적화로 LCP 개선</strong></summary>
  
견적 요청 페이지의 Lighthouse 모바일 측정에서 초기 로딩 병목을 확인하고, 폰트와 주요 이미지의 로딩 방식을 개선했습니다.

#### 개선 내용

- 약 2MB의 Pretendard 전체 폰트 대신 화면 문구 중심의 핵심 서브셋을 우선 로딩
- 사용자 이름·주소 등 핵심 서브셋에 없는 글자는 추가 서브셋으로 보완
- 첫 화면의 주요 이미지에 `loading="eager"`와 `fetchPriority="high"` 적용
- GNB 홈 링크의 prefetch를 해제해 현재 화면에 필요하지 않은 랜딩 리소스 다운로드 방지

#### 측정 결과

| 지표 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| Lighthouse 모바일 성능 점수 | 75 | 84 |
| LCP | 14.2초 | 4.6초 |
| 폰트 다운로드 | 2,010KB | 146KB |
| JavaScript 다운로드 | 307KB | 254KB |
| 요청 수 | 43개 | 39개 |

> 프로덕션 빌드와 응답 시간이 200ms인 모의 API 환경에서 측정한 결과입니다. 운영 환경의 실제 사용자 지표와는 구분합니다.

LCP는 크게 개선됐지만, 인증 확인과 활성 요청 조회 이후 주요 화면이 렌더링되는 대기 구간은 추가 개선 대상으로 남았습니다.

관련 PR: [FE #97](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/97)
  
</details>

<details>
<summary><strong>10.2 모바일 리소스 크기와 애니메이션 로딩 최적화</strong></summary>

모바일 화면에서 실제로 사용하는 리소스 크기와 기능을 기준으로 추가 최적화를 진행했습니다.

- 핵심 폰트의 가변 굵기 범위를 실제 사용 범위인 `400~900`으로 축소
- 이미지 크기 목록에 `480px`을 추가해 작은 화면에서 불필요하게 큰 이미지 다운로드 방지
- 랜딩 애니메이션 기능을 지연 로딩해 초기 JavaScript 전송량 감소
- 프로필 수정 화면의 주요 이미지 로딩 우선순위 조정

| 항목 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| 핵심 폰트 크기 | 146KB | 109KB |
| 모바일 랜딩 캐릭터 이미지 | 52KB | 29KB |
| 첫 화면 이전 JavaScript | 약 285KB | 약 261KB |
| 랜딩 모바일 성능 점수 | 83~87 | 87~91 |

> 로컬 프로덕션 빌드의 Lighthouse 측정 결과이며, 앞의 견적 요청 페이지와는 별도 측정입니다. 운영 성능은 배포 후 동일 조건에서 다시 확인해야 합니다.

추가로 랜딩 히어로 이미지에 높은 요청 우선순위를 지정하고 API origin 사전 연결을 적용했습니다. 이 추가 변경의 운영 LCP 개선 폭은 후속 측정이 필요합니다.

관련 PR: [FE #101](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/101), [FE #106](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/106)


</details>

<details>
<summary><strong>10.3 페이지 단위 조회와 선택적 캐시 갱신</strong></summary>

목록 데이터는 Cursor 기반 API와 TanStack Query의 `useInfiniteQuery`를 연결해 필요한 페이지부터 조회합니다.

- Backend에서 `limit + 1`개를 조회해 다음 페이지 존재 여부 판단
- Frontend에서 응답의 `nextCursor`를 다음 요청에 전달
- 검색·필터·정렬 조건을 Query key에 포함해 조회 상태 구분
- 견적 전송·반려 등 Mutation 이후 관련 Query를 선택적으로 무효화
- 다음 페이지를 가져오는 동안 기존 카드 목록 유지

초기 요청 실패와 추가 페이지 요청 실패도 구분했습니다.

| 상황 | 화면 처리 |
| --- | --- |
| 첫 페이지 조회 실패 | 오류 화면과 재시도 제공 |
| 추가 페이지 조회 실패 | 기존 목록을 유지하고 하단에 재시도 제공 |

이는 한 번에 조회·전송하는 데이터 양을 제한하고 목록 이용 흐름을 유지하기 위한 설계입니다. 응답 시간이나 부하 감소율은 별도로 측정하지 않았습니다.

관련 PR: [BE #15](https://github.com/kimchanhee0309/Moving-BE-Team1/pull/15), [FE #56](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/56), [FE #59](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/59)


</details>

<details>
<summary><strong>10.4 인증 갱신 요청 통합과 로딩 범위 축소</strong></summary>

여러 API에서 인증 만료 응답이 동시에 발생해도 하나의 Refresh 요청 결과를 공유하도록 구성했습니다.

- Access Token 누락·만료에 해당하는 오류만 자동 갱신
- 동시에 진행되는 Refresh 요청을 하나의 Promise로 공유
- 갱신 성공 후 원래 요청을 최대 한 번 재시도
- 로그아웃 이전에 시작된 늦은 응답이 인증 상태를 다시 복원하지 않도록 세대 값 검사
- Backend는 유효한 Access Token이 있으면 토큰을 재발급하지 않도록 처리

공개 페이지의 로딩 범위도 조정했습니다.

- 최초 세션 확인 중에도 랜딩 본문과 공개 메뉴 표시
- 인증 정보에 의존하는 GNB 계정 영역만 로딩 UI 표시
- Server Component에서는 같은 요청의 세션 조회 결과를 공유

이를 통해 인증 확인 때문에 공개 화면 전체가 가려지는 현상을 개선하고 중복 토큰 갱신을 줄였습니다.

관련 PR: [FE #78](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/78), [BE #34](https://github.com/kimchanhee0309/Moving-BE-Team1/pull/34)

</details>

<details>
<summary><strong>10.5 SSE 연결 관리 일원화</strong></summary>

라우트 그룹별 GNB에서 알림 구독을 관리하던 구조를 루트 `NotificationProvider`로 옮겼습니다.

- 같은 앱 인스턴스에서 알림 구독을 한 곳에서 관리
- 라우트 그룹 이동에 따른 불필요한 연결 종료·재생성 방지
- 로그인·프로필 등록 상태에 따라 조회와 구독 시작 여부 결정
- 연결 종료 시 EventSource와 이벤트 리스너 정리
- 연결 복구 시 알림 목록을 다시 조회해 최신 상태 확인

관련 PR: [FE #77](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/77)
</details>

<details>
<summary><strong>10.6 이미지 저장·전송과 캐시 정책 분리</strong></summary>

프로필 이미지는 S3에 저장하고 CloudFront URL로 제공할 수 있도록 구성했습니다.

- 이미지 검증을 통과한 파일만 S3에 업로드
- UUID 기반 객체 key를 사용해 기존 파일 덮어쓰기 방지
- 브라우저와 CDN의 캐시 유지 시간을 분리
- 이미지 교체·회원 탈퇴 시 원본 삭제와 CDN 캐시 무효화 요청

현재 캐시 정책은 다음과 같습니다.

```http
Cache-Control: public, max-age=3600, s-maxage=31536000
```

브라우저는 1시간, CDN은 1년 동안 캐시하도록 설정했습니다. 실제 적용 TTL은 CloudFront 캐시 정책에도 영향을 받으며, 운영 캐시 적중률과 응답 시간 개선 폭은 별도 측정 대상입니다.

관련 PR: [BE #44](https://github.com/kimchanhee0309/Moving-BE-Team1/pull/44), [BE #46](https://github.com/kimchanhee0309/Moving-BE-Team1/pull/46)

</details>

---

## 11. 트러블 슈팅

<details>
<summary><strong>11.1 운영 서버가 RDS 대신 localhost에 연결하던 문제</strong></summary>

#### 문제

배포 환경에서 회원가입과 데이터 조회 중 Prisma `P1001` 연결 오류가 발생했습니다.

#### 원인

로컬 SSH Tunnel용 데이터베이스 주소가 운영 환경에도 적용되어 있었습니다. EC2에서 `localhost`는 RDS가 아닌 EC2 자신을 가리키기 때문에 연결에 실패했습니다.

#### 해결

- 로컬과 운영의 `DATABASE_URL` 분리
- 운영에서는 RDS endpoint로 연결
- RDS 보안 그룹의 5432 포트 인바운드에 EC2 보안 그룹 허용
- 변경된 환경변수가 PM2 프로세스에 반영되도록 재시작 및 `--update-env` 확인

#### 결과

운영 서버에서 RDS 연결이 복구되어 회원가입·로그인·데이터 조회가 정상 동작했습니다.

#### 배운 점

환경변수 이름이 같더라도 실행 환경에 따라 주소와 네트워크 경로가 달라집니다. 연결 오류는 애플리케이션 설정과 네트워크 접근 조건을 함께 확인해야 합니다.

</details>

<details>
<summary><strong>11.2 운영 환경에서 SSE 인증·CORS 오류가 발생한 문제</strong></summary>

#### 문제

로컬에서는 동작하던 알림 스트림이 운영에서 CORS 오류와 함께 차단됐습니다.

```text
Frontend: https://moving.it.kr
Backend:  https://api.moving.it.kr
```

#### 원인

두 주소는 서로 다른 Origin입니다. 서버의 CORS 응답 설정과 브라우저의 인증 쿠키 전달 설정이 맞지 않았고, SSE의 장기 연결을 위한 프록시 설정도 함께 점검해야 했습니다.

#### 해결

- 허용 Origin에 정확한 Frontend 주소 지정
- Backend CORS에 `credentials: true` 적용
- 일반 API 요청에 `credentials: "include"` 적용
- EventSource에 `withCredentials: true` 적용
- 운영 Cookie의 Domain·Secure·SameSite 설정을 배포 구성에 맞게 정리
- Nginx 버퍼링과 Proxy·ALB의 연결 유지 시간 점검
- SSE 응답에 `X-Accel-Buffering: no` 설정과 20초 주기의 heartbeat 적용

#### 결과

운영 환경에서 인증 쿠키를 전달한 상태로 SSE 알림 스트림에 연결할 수 있게 됐습니다.

#### 배운 점

실시간 연결 문제는 CORS뿐 아니라 Cookie, 클라이언트 자격 증명 옵션, Proxy와 Load Balancer까지 요청 경로 전체를 확인해야 합니다.

</details>

<details>
<summary><strong>11.3 Router 구현 이후에도 API가 404를 반환한 문제</strong></summary>

#### 문제

기사님 견적 관련 Router와 Controller를 구현했지만 `/movers/me/quotes` 요청이 404로 반환됐습니다.

#### 원인

기능 Router가 최상위 `apiRouter`에 연결되지 않아 Express에 실제 요청 경로가 등록되지 않았습니다.

#### 해결

- 최상위 Router에서 `moverQuoteRouter`를 import
- `/movers/me` prefix에 기능 Router 연결
- Swagger 경로와 실제 Router 조합 비교
- 목록·상세·반려 요청 API의 접근 경로 확인

#### 결과

기사님 견적 관련 API가 의도한 경로에서 호출되도록 수정했습니다.

#### 배운 점

Express 기능 구현에는 Router 파일 작성뿐 아니라 상위 Router 연결과 최종 URL 검증까지 포함되어야 합니다.
</details>

<details>
<summary><strong>11.4 반려 견적의 nullable 가격으로 목록 처리가 실패한 문제</strong></summary>

#### 문제

가격이 없는 반려 견적이 포함되면 목록 변환 과정에서 오류가 발생했습니다.

#### 원인

반려 견적은 가격을 제시하지 않아 `price`가 `null`일 수 있지만, 일부 타입과 처리 로직은 숫자가 항상 존재한다고 가정했습니다.

#### 해결

- Prisma Schema의 nullable 정의에 맞춰 Backend DTO와 Frontend 타입 정리
- API 응답 처리와 카드 UI에서 `number | null` 대응
- 가격이 없을 때 표시할 안내 문구 추가
- 상태별 목록·상세 처리 검증

#### 결과

가격이 없는 견적도 전체 목록을 중단시키지 않고 표시할 수 있게 됐습니다.

#### 배운 점

데이터베이스와 API, Frontend 타입, UI가 같은 도메인 규칙을 공유해야 합니다. 선택 값의 부재도 정상 데이터로 처리해야 합니다.

관련 PR: [FE #59](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/59)
</details>

<details>
<summary><strong>11.5 요청 처리 중 모달을 다시 열어 중복 제출할 수 있던 문제</strong></summary>

#### 문제

견적 전송·반려 요청 중 제출 버튼은 비활성화됐지만, Esc나 배경 클릭으로 모달을 닫고 다시 열 수 있었습니다.

#### 원인

모달 내부의 Mutation 상태가 모달 Shell의 닫기 정책과 연결되지 않았습니다.

#### 해결

- Mutation의 `isPending` 상태를 모달 닫기 정책에 연결
- 처리 중 닫기 버튼·Esc·배경 클릭 제한
- Mutation 성공 후 모달 종료
- Backend에서도 중복 처리 여부와 요청 상태 검증
- 성공 후 관련 목록 캐시 갱신

#### 결과

진행 중인 요청을 남긴 채 모달을 다시 열어 제출할 수 있는 경로를 줄였습니다.

#### 배운 점

중복 제출 방지는 버튼 비활성화뿐 아니라 모달 종료 경로와 서버의 동시성 처리까지 포함해야 합니다.
</details>

<details>
<summary><strong>11.6 API 요청 전후 모달 포커스가 이동하던 문제</strong></summary>

#### 문제

모달에서 API 요청을 시작하거나 완료할 때 입력하던 위치의 포커스가 닫기 버튼으로 이동했습니다.

#### 원인

포커스 관리 effect가 닫기 callback에 의존하고 있었습니다. 요청 상태에 따라 닫기 정책과 callback이 바뀔 때 effect가 다시 실행되면서 초기 포커스를 재설정했습니다.

#### 해결

- 최신 닫기 callback은 ref로 관리
- 초기 포커스와 포커스 트랩 effect는 모달 열림 상태를 기준으로 실행
- Esc·배경 클릭 제한과 모달 종료 후 포커스 복귀 동작 확인

#### 결과

요청 상태가 바뀌어도 사용자의 입력 포커스가 유지되도록 수정했습니다.

#### 배운 점

effect의 의존성에는 실행 시점을 결정하는 상태를 구분해서 넣어야 합니다. 최신 callback 참조와 초기화 동작의 재실행 조건을 분리할 필요가 있습니다.

관련 PR: [FE #88](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/88)
</details>

<details>
<summary><strong>11.7 삭제한 프로필 이미지가 CDN 캐시에 남을 수 있던 문제</strong></summary>

#### 문제

프로필 이미지 교체나 회원 탈퇴로 S3 객체를 삭제해도, CloudFront에 캐시된 사본은 기존 주소로 제공될 수 있었습니다.

#### 원인

원본 객체 삭제와 CDN 캐시 무효화가 별개인데 장기 캐시만 설정되어 있었습니다. 브라우저에도 장기간 캐시가 남을 수 있었습니다.

#### 해결

- 공개된 프로필 이미지 삭제 후 CloudFront 캐시 무효화 요청
- 브라우저 캐시 1시간, CDN 캐시 1년으로 유지 시간 분리
- 무효화 실패 시 로그 기록과 제한된 재시도 처리

#### 결과와 검증 범위

원본 삭제와 CDN 캐시 정리를 연결하는 코드를 구현했습니다. 실제 운영에서는 IAM 권한과 배포 ID를 설정한 뒤 이전 이미지 URL의 응답을 확인해야 합니다.

CloudFront 무효화는 이미 저장된 브라우저 캐시를 삭제하지 않으므로, 시크릿 창이나 캐시를 사용하지 않는 요청으로 구분해 검증해야 합니다.

#### 배운 점

캐시는 조회 성능뿐 아니라 수정·삭제 이후의 데이터 제공 정책까지 함께 설계해야 합니다.

관련 PR: [BE #46](https://github.com/kimchanhee0309/Moving-BE-Team1/pull/46)
</details>

<details>
<summary><strong>11.8 반응형 타이포그래피 클래스가 적용되지 않던 문제</strong></summary>

#### 문제

데스크톱에서 커져야 하는 탭·제목 등의 글자가 모바일 크기로 유지됐습니다.

#### 원인

공통 타이포그래피가 일반 CSS 클래스로 정의되어 있어 Tailwind의 반응형 접두사를 붙인 스타일이 생성되지 않았습니다.

```tsx
className="text-md-semibold min-[1200px]:text-xl-semibold"
```

클래스 문자열은 존재했지만 빌드된 CSS에 대응하는 반응형 규칙이 없었습니다.

#### 해결

- 공통 타이포그래피 정의를 Tailwind `@utility`로 변경
- 클래스 이름과 디자인 값을 유지하면서 반응형 스타일 생성
- 여러 화면 크기에서 글자 크기와 레이아웃 변화 확인

#### 결과

공통 정의를 수정해 여러 화면에 작성되어 있던 반응형 타이포그래피가 적용되도록 개선했습니다.

#### 배운 점

스타일이 적용되지 않을 때는 클래스 사용처뿐 아니라 빌드 결과에 해당 CSS 규칙이 생성되는지도 확인해야 합니다.

관련 PR: [FE #104](https://github.com/kimchanhee0309/Moving-FE-Team1/pull/104)
</details>

---

## 12. 프로젝트 실행 방법

### Frontend

#### 저장소 Clone

```bash
git clone https://github.com/kimchanhee0309/Moving-FE-Team1.git
cd Moving-FE-Team1
```

#### 패키지 설치

```bash
npm ci
```

#### 환경변수 설정

프로젝트 루트에 `.env.local` 파일을 생성합니다.

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_JUSO_API_KEY=your-address-api-key
```

> 실제 환경변수 이름은 프로젝트의 `.env.example`과 `src/common/constants/env.ts`를 기준으로 확인해 주세요.

#### 개발 서버 실행

```bash
npm run dev
```

기본 주소:

```text
http://localhost:3000
```

#### 빌드 및 검사

```bash
npm run lint
npm run build
npm start
```

### Backend

Backend 실행 방법은 아래 저장소에서 확인할 수 있습니다.

- https://github.com/kimchanhee0309/Moving-BE-Team1

기본 개발 API 주소:

```text
http://localhost:4000
```

Swagger UI:

```text
http://localhost:4000/api-docs
```

---

## 13. 향후 개선 계획

- Redis Cache-Aside 패턴을 활용한 기사님 목록 및 공개 조회 API 캐싱
- Redis Pub/Sub을 활용한 다중 서버 환경의 SSE 알림 확장
- Playwright 또는 Cypress 기반 E2E 테스트 추가
- 테스트 커버리지 기준 설정 및 CI 검증
- 운영 로그 수집과 APM 적용
- 이미지 업로드 진행률과 재시도 UX 개선
- 알림 재연결 및 누락 이벤트 복구 전략 고도화
- 접근성 검사와 키보드 내비게이션 개선
- 무중단 배포 및 Auto Scaling 구성
- 부하 테스트를 통한 병목 구간 측정 및 최적화

---

## 프로젝트 회고

> 프로젝트 회고 링크 또는 내용을 여기에 추가해 주세요.

[프로젝트 회고 바로가기](RETROSPECTIVE_URL)
message.txt
28KB
