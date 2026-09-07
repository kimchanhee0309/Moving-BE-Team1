# 인증 구현 계약

현재 팀 서버의 CUSTOMER/MOVER, success/data/error 응답, HttpOnly accessToken/refreshToken 쿠키를 기준으로 합니다. 별도 auth-working-copy 초안(USER, Bearer JWT)은 적용하지 않습니다.

- POST /auth/signup: name, email, phone, password, role → 201 {user}; 가입 후 세션 발급
- POST /auth/login: email, password, role → 200 {user}
- GET /auth/me: access cookie → 200 {user}; 인증 실패 401
- POST /auth/refresh: refresh cookie → 200 {user}; 토큰 회전
- POST /auth/logout: 세션 폐기 및 쿠키 제거 → 204
- GET /auth/oauth/:provider?role=CUSTOMER|MOVER&redirect=/path: OAuth 시작
- GET /auth/oauth/:provider/callback: 일회용 state 및 브라우저 쿠키 검증 후 코드 교환, 계정 생성/조회, 세션 발급, 프런트 callback으로 이동

User: id, name, email(nullable), phone(nullable), role, profileCompleted. 클라이언트는 profileCompleted를 변경할 수 없습니다. 프로필 도메인이 실제 등록 완료 시 서버에서 갱신해야 합니다.

이메일은 소문자로 정규화하고 전역 유일합니다. SNS 계정은 provider+providerId로 식별합니다. 같은 이메일의 기존 계정과 자동 연결하지 않고 충돌 오류를 반환합니다. 이메일 제공에 동의하지 않은 SNS 계정도 provider ID로 식별하며 이메일을 만들어 내지 않습니다.

비밀번호는 Node scrypt로 해시합니다. 액세스/리프레시 토큰은 256bit 난수이며 DB에는 SHA-256 해시만 저장합니다. 세션별 만료, 로그아웃 즉시 폐기, 리프레시 원자적 회전, OAuth state 브라우저 바인딩을 검증합니다. 로그인 시도는 IP 단위로 제한합니다.

검증: Node 내장 test runner, 별도 PostgreSQL DB에서 실제 HTTP/DB 통합 검사. OAuth 공급자 통신은 주입된 모의 어댑터 검사와 실제 공급자 로그인을 구분합니다. 실제 공급자 테스트에는 콘솔 앱/콜백 등록 및 비밀키가 필요합니다. 프로필 기능 구현은 이번 인증 범위 밖입니다.
