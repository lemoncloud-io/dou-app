# admin-v2

Chatic 관리자 콘솔. 소켓 관제(`socket-lab`), 리포트·로그 조회(`report-logs`), 멤버십 관리
(`users`), 로그인(`auth`) 네 피처로 이뤄진다.

## 세션과 게이트가 이 앱의 특이점이다

일반 앱과 다른 점이 셋 있고, 셋 다 "콘솔은 명시적 로그인을 요구한다"에서 나온다.

- **게스트가 없다.** [`app.tsx`](src/app/app.tsx)가 `runtime.connection.RuntimeAuthHost`로
  감싸는데, 이 호스트는 세션 init과 소켓 인증 루프만 돌리고 **guest keep-alive와 채팅 데이터
  sync를 의도적으로 제외**한다. 콘솔은 로그인해야 들어오고 데이터 스코프가 필요 없다.
- **role 게이트가 라우트 앞에 선다.** [`ProtectedRoute`](src/app/components/ProtectedRoute.tsx)가
  프로필을 낙관적으로 읽어 admin이 아니면 거부 화면을 낸다. 실패를 삼키는 것이 **여기 호출부에**
  있는 것이 의도다 — `@chatic/data`의 아래 계층은 전부 reject하고, null이냐 throw냐는 화면 정책이라
  게이트가 자기 재시도 상태를 그릴 수 있어야 한다.
- **좀비 세션을 스스로 정리한다.** [`useRelaySessionGuard`](src/app/hooks/useRelaySessionGuard.ts)가
  30초 간격 + 탭 포커스마다 relay 자격증명을 검사하고, **연속 3회** 실패하면 `/auth/login`으로
  보낸다. 연속 조건이 붙은 이유는 한 번의 blip과 죽은 세션을 구별할 수 없기 때문이다 — blip으로
  관리자를 로그아웃시키는 쪽이 403 세 틱보다 나쁘다. 검사 본체는 app-runtime의
  `useSessionStalenessGuard`이고 여기 남은 것은 **정책**(주기·횟수·좀비 처리)이다.

이 앱은 `@chatic/app-runtime` **하나만** 본다. `ProtectedRoute`가 repository 타입을
`@chatic/data`에서 import하지 않고 훅 반환형에서 유도하는 것도 그래서다 — 타입 import 하나로도
두 번째 패키지가 이 앱의 빌드 표면이 된다.

## 피처

| 폴더                                                    | 무엇                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`features/socket-lab`](src/app/features/socket-lab/)   | 소켓 관제. **Observe 탭**(유저 watchlist·디바이스 상태 실시간 감시·유니캐스트)과 **Probe 탭**(샌드박스 클라이언트, 부하 테스트). 상태는 `runtime/`의 컨테이너 셋(`client-container`·`observe-sync-container`·`sandbox-controller`)이 갖고 화면은 `components/observe`·`components/probe` |
| [`features/report-logs`](src/app/features/report-logs/) | `/mocks/0/list` 조회. 사용자 제보와 배치 업로드 로그 엔트리를 한 화면에서 훑는다                                                                                                                                                                                                         |
| [`features/users`](src/app/features/users/)             | 멤버십 관리                                                                                                                                                                                                                                                                              |
| [`features/auth`](src/app/features/auth/)               | 소셜 로그인·로그아웃·OAuth 콜백                                                                                                                                                                                                                                                          |

## 문서

`docs/specs/`는 **스펙과 요구사항 기록**이고 현행 구조 서술이 아니다.

- [socket-lab 요구사항](docs/specs/socket-lab/00-requirement.md) — 왜 만들었나 (구조는 이 README)
- [observe 실시간 동기화 요구사항](docs/specs/observe-live-sync/00-requirement.md) — 구현됨
- [auth-session 스펙](docs/specs/auth-session/spec.md) — 로그인 하이드레이션·토큰 리프레시
- [report-logs 스펙](docs/specs/report-logs/spec.md) — 리포트 로그 목록 조회

## 커맨드

```bash
nx serve admin-v2
nx test admin-v2
nx build admin-v2
```
