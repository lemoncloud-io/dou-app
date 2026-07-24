# ADR-0028: admin-v2 인증 하이드레이션·토큰 리프레시(app-runtime 채택)·로그 분석 확장

> 상태: Accepted · 결정일: 2026-07-23

## 맥락 (Context)

admin-v2([ADR-0027](0027-admin-v2-report-log-list.md)에서 리포트 로그 조회 화면 추가)를
실사용하면서 인증·세션 관련 문제 두 가지와, 로그 분석 기능 확장 요구가 나왔다.

**1) 로그인 후 리다이렉트 실패.** [OAuthResponsePage](../../apps/admin-v2/src/app/features/auth/OAuthResponsePage.tsx)가
`createCredentialsByProvider` + `fetchProfile`만 호출한다. 그런데 `createCredentialsByProvider`
([transport/authRuntime.ts](../../libs/web-core/src/transport/authRuntime.ts))는 SDK 토큰 저장 +
AWS 자격증명만 만들고 `relayCore.saveRelayToken`/`setSessionAuthenticated(true)`/notify를 호출하지
않으며, `fetchProfile`도 세션 상태를 바꾸지 않는다. 그래서 `useSessionAuth().isAuthenticated`가
`false` 그대로라 [ProtectedRoute](../../apps/admin-v2/src/app/components/ProtectedRoute.tsx)가
`/auth/login`으로 되돌린다(풀 리로드 시 `initializeRelaySession`이 SDK 저장소를 읽어 살아나서
"새로고침하면 됨"처럼 보임). 이는 타이밍 레이스가 아니라 이 경로에서 플래그가 **아예 안 켜지는** 문제다.

**2) 토큰 만료 리프레시 부재.** admin-v2는 app-runtime을 붙이지 않아 SDK `AuthController`의 자동
리프레시가 없고, 수동 리프레시 호출도 없다. 부팅 1회 `initializeRelaySession` 외에 리프레시
경로가 없어, 만료되면 서명 요청이 403/INVALID_TOKEN → `handleAuthError` → alert + `/auth/logout`
강제 이동으로 끝난다. (과거의 `useTokenRefresh` 60초 폴링 훅은 web-core에서 삭제됨 — 재생성 금지,
[memory 노트](../../../.claude/projects) 참조.)

**3) 로그 분석 확장 요구.** ADR-0027의 목록/집계/필터는 **불러온 페이지(≤1,000건)만** 대상이라
전체(prod 실측 ~7,760건)에서 특정 uid/메시지를 찾지 못하는 한계가 있고, 추가 분석·타 피처 연동
요구가 있다.

제약: admin-v2는 socket-lab이 자체 WS(관측/probe)를 이미 열고, 앱 레벨엔 공용 네비만 있다
(app-runtime 미사용). `RuntimeConnectionHost`는 `binding`과 소켓 delegate를 요구하며
`useRelaySessionKeepAlive(true)`는 미인증 시 게스트 자동 로그인을 건다.

## 결정 (Decision)

**A. 로그인 하이드레이션 수정(버그).** OAuthResponsePage에서 `createCredentialsByProvider` 뒤에
`refreshRelaySession({ syncProfile: true })`를 호출한다(apps/web의
[useOAuthLogin](../../apps/web/src/app/features/auth/hooks/useOAuthLogin.ts) 패턴). 이 호출이
`applyRelaySession` → `setSessionAuthenticated(true)` + notify를 돌려 `navigate` 전에
`isAuthenticated`가 true가 되고 ProtectedRoute를 통과한다. `fetchProfile` 단독 호출은 대체/제거.

**B. 토큰 리프레시 = app-runtime `RuntimeConnectionHost` 최소 채택.** SDK `AuthController`가
자동 리프레시를 소유하고, 갱신 토큰은 `commitServerRefreshedToken`으로 web-core에 write-back되어
후속 HTTP 서명 요청도 신선한 자격증명을 쓴다.

- 범위: 소켓 세션 + `SocketReauthBinder`(재인증 write-back)만. 데이터 바인딩은 no-op/최소.
- **게스트 keep-alive(`useRelaySessionKeepAlive`)는 끈다** — admin은 실제 로그인만 허용.
- app.tsx의 수동 `startWebCoreInit()` 이중 부팅은 제거하고 `RuntimeConnectionHost`의
  `useInitWebCore` 단일 경로로 통합.
- `useTokenRefresh`는 재생성하지 않는다.

**C. 로그 분석 확장 — 이번 범위 포함:**

- **socket-lab 연동**: 리포트의 `uid`/`deviceModel`에서 socket-lab Observe로 점프(기존 유저 검색·
  디바이스 관측 API 재사용)해 "이 에러 낸 유저의 현재 상태" 확인.
- **시계열/급증 뷰**: 시간대별 에러 발생 추이 차트 + 급증 감지(socket-lab의 기존 차트 컴포넌트 재사용).
- **편의기능 묶음**: stage 전환(d1/v1), 상대 시각 표기, 자동 새로고침, CSV 내보내기.

**이번 범위 제외:**

- **서버사이드 필터/검색** — `/mocks/0/list`의 검색/기간/uid 파라미터 지원이 미확인. 백엔드 확인
  후 별도로 다룬다(그전까지 필터·집계는 불러온 페이지 한정, UI에 명시).

## 대안 (Alternatives)

- **리프레시: 수동 스케줄/401 복구** — `refreshRelaySession`을 만료 임박에 주기 호출 + 401 복구에
  연결. 가장 가볍고 소켓 불필요. 그러나 자동화 로직을 직접 짜야 하고, SDK가 이미 검증된 리프레시를
  소유하는데 중복 구현이 됨 → 사용자가 app-runtime 채택을 택해 폐기.
- **리프레시: 현행 유지(만료=로그아웃)** — 모니터링 대시보드를 오래 열어두는 사용성과 배치됨 → 폐기.
- **app-runtime: 전체 AppRuntime** — apps/web처럼 채팅 데이터 바인딩까지 포함. admin-v2엔 불필요해
  과임 → RuntimeConnectionHost 최소 채택으로 축소.
- **리프레시: 재인증만 커스텀 배선** — app-runtime 통짜 없이 AuthController 부분만 직접 연결.
  가장 가볍지만 직접 배선 부담·유지보수 분기 → 폐기.
- **로그: 서버사이드 필터 즉시 구현** — 백엔드 파라미터 미확인 상태에서 착수 시 헛구현 위험 → 제외.

## 결과 (Consequences)

- **장점**: 로그인 리다이렉트가 정상화되고, 세션이 SDK AuthController로 자동 유지되어 대시보드를
  오래 열어둬도 만료 로그아웃이 줄어든다. 로그 화면이 socket-lab과 이어져 "에러→유저 상태" 진단이
  한 흐름이 된다.
- **트레이드오프 / 리스크**:
    - app-runtime 채택으로 admin-v2에 **소켓 세션 레이어가 추가**된다(관리자 본인 세션). socket-lab의
      자체 관측 소켓과 목적이 달라 공존하지만 레이어가 둘이 되고, `RuntimeConnectionHost`의
      binding/delegate 배관이 필요하다.
    - AuthController 리프레시는 **소켓 auth 루프 위에서** 돈다. admin-v2가 클라우드 미선택 상태에서
      relay 소켓만으로 리프레시가 충분한지 구현 단계에서 검증해야 한다.
    - `startWebCoreInit` 이중 부팅 제거 시 초기화 순서 회귀가 없는지 확인 필요.
    - 게스트 keep-alive를 끄므로 미인증 사용자는 로그인 화면에 머문다(의도된 동작).
    - 서버사이드 필터 제외로, 대량 로그 정밀 탐색은 다음 라운드까지 페이지 한정으로 남는다.

## 다음 단계

이 ADR을 입력으로 [[dev-2_implement]] Phase A로 넘어간다. 스펙에서 먼저 확정할 것:
`RuntimeConnectionHost` 최소 binding 구성과 relay-only 리프레시 검증, socket-lab 점프 연동 지점.
ADR-0027의 report-logs 문서는 이번 확장(C)을 반영해 개정한다.
