# [기술 스펙 명세서] 설정 페이지

## 1. 목적

설정 페이지는 계정 및 세션 제어를 담당하는 화면이다.

오버레이가 상태 조회 중심이라면, 설정 페이지는 로그인 이동과 로그아웃 같은
명시적 세션 액션을 담당한다.

## 2. 필수 기능

- 로그인 페이지로 이동하는 버튼
- 현재 로그인 상태 표시
- cloud 세션 로그아웃
- 중계서버 로그아웃

## 3. 화면 구성

### 3.1 상단 액션

- 로그인 페이지 이동 버튼

동작:

- 클릭 시 로그인 페이지로 이동한다
- 현재 guest 상태이든 cloud 상태이든 동일하게 접근 가능해야 한다

### 3.2 로그인 상태 요약

표시 항목:

- relay 로그인 여부
- cloud 로그인 여부
- 현재 활성 cloud id
- 현재 활성 place id
- 사용자 식별 정보 요약

### 3.3 로그아웃 액션

#### Cloud 로그아웃

- 현재 cloud 세션만 종료한다 (`useLogoutCloudSession().logoutCloudSession()`)
- relay 세션은 유지한다
- `logoutCloudSession()` 내부에서 `cloud.isActive`가 `false`로 변경되면 `resolveActiveServerContext`가 자동으로 `activeServer.kind = 'relay'`로 전환한다
- 결과적으로 채팅 홈은 relay 기준 상태로 자동 복귀한다 (relay 전환 직후 기존 cloud 기준 place/channel 목록은 폐기·재조회)

코드 근거:

- `libs/web-core/src/hooks/session/actions/useLogoutCloudSession.ts` — cloud 세션 로그아웃 hook
- `libs/web-core/src/session/contextStore.ts` — `resolveActiveServerContext` (cloud.isActive false → relay 자동 전환)

#### Relay 로그아웃

- 중계서버 로그아웃을 수행한다
- relay 로그아웃 시 cloud 상태도 함께 정리되어야 한다
- 성공 시 앱은 relay 인증 부재를 감지한 뒤 guest 재로그인을 즉시 수행해야 한다
- 결과적으로 앱은 `default` cloud 기준 guest 기본 상태로 복귀해야 한다

## 4. 주의 사항

- relay 로그아웃은 cloud 로그아웃의 상위 개념이다
- 두 로그아웃 버튼의 의미를 UI 텍스트에서 명확히 구분해야 한다
- 로그아웃 직후 오버레이, 채팅 홈, 채널 상세의 상태가 동시에 초기화되어야 한다

## 5. 검증 포인트

- cloud 로그아웃 후 relay 세션은 남아 있어야 한다
- relay 로그아웃 후 cloud 상태가 같이 제거된 뒤 guest 세션이 다시 생성되어야 한다
- 로그인 상태 요약이 오버레이의 session 상태와 일치해야 한다

## 관련 문서

- [login.md](login.md) — 이메일 로그인 페이지
- [invite.md](invite.md) — 초대 생성·수락 플로우
- [../architecture.SPEC.md](../architecture.SPEC.md) — 세션 상태 전이 전체 (§8)
- [../overlay/README.md](../overlay/README.md) — 세션/소켓 상태 조회
