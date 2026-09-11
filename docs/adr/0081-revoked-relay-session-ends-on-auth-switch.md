# ADR-0081: 서버가 revoke한 relay 세션은 그 세션의 판정이다 — `auth.switch`에서 로컬로 끝낸다

> 상태: Accepted · 결정일: 2026-09-11 · 구현: `af161996` (PR #445)
> 범위: `libs/app-runtime/src/socket/auth/revokedSession.ts` (신규) · `libs/app-runtime/src/socket/auth/switchSite.ts`
> 관련: [ADR-0076](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md) (인증 상태 단일 판정 —
> 이 문서는 그 판정 목록에 빠져 있던 "revoke"를 다룬다) · [ADR-0070](./0070-app-runtime-session-hub.md)

## 맥락 (Context)

### 증상

desktop-web에서 클라우드 타일을 누르면 `Couldn't switch cloud. Try again.` 토스트가 뜨고, 30초쯤 뒤 세션이
통째로 사라졌다. 콘솔에는 부팅 직후부터 서로 다른 세 경로의 403이 찍혀 있었다.

```
GET  …/clouds/0/list?limit=-1&view=mine   403 (Forbidden)
POST …/users/0/reg-dev?force=true         403 (Forbidden)
AuthSwitchError: auth.switch failed: server
  Caused by: Error: 403 NOT ALLOWED - session revoked @refreshAccessToken(…) - auth.switch:error
```

세 경로가 한꺼번에 실패했다는 것은 기능의 버그가 아니라 세션 하나가 죽었다는 뜻이다. `session revoked`는
만료(`expired`)도 서명 오류(`invalid sign`)도 아닌 **revoke**다.

### revoke는 되돌릴 수 없다

백엔드는 `POST /users/0/logout`(`doLogout`)에서 auth row에 `revoked`를 찍는다. 그 뒤로는 그 세션의
refresh와 issue를 전부 `403 NOT ALLOWED - session revoked @<scope>`로 막는다(chatic-backend-api
`service/backend-proxy.ts`). 클라이언트가 가진 무엇으로도 이 세션을 살릴 수 없다. refresh도 403이고,
클라우드 전환의 첫 단계인 `delegate-cloud`도 relay 서명 요청이라 403이다.

### 런타임은 revoke된 세션을 로그인 상태로 본다

`identity.isAuthenticated`는 **세션 존재** 판정이다(`hasStoredRelaySession`). 죽은 토큰도 저장소에
있으니 true다. 그래서 `useRelaySessionKeepAlive`의 게스트 로그인이 돌지 않고, 화면마다 제각기 일반 실패를
보인다. 세션은 결국 `RelayCredentialRenewer.onTerminalExpiry`가 SDK 실패 한도와 30초 확인 창을 지난 뒤에
끝내지만, 왜 끝났는지는 어디에도 남지 않는다.

### 원인은 로그아웃 자신이었다

`7139e42c`가 `libs/web-config`를 은퇴시키면서 `?logout=1`을 읽어 저장 키를 지우던 부수효과도 같이
사라졌다. 로그아웃은 서버에서 세션을 revoke하고, `/?logout=1`로 돌아온 문서는 그 토큰을 지우지 않고 다시
부팅했다. 청소는 `1a83ee65`(`logoutStorageSweep.ts`)에서 복구됐고 운영은 develop 재배포로 정상화됐다.

그래도 저장된 토큰이 서버에서 죽는 경로는 남는다. 다른 기기의 `?aid=` 로그아웃, 관리자 revoke, 청소가
다시 끊기는 경우다. 이 결정은 그 경로들의 **안전망**이다.

## 결정 (Decision)

### 1. revoke 거절은 이번 요청이 아니라 세션의 판정으로 읽는다

`isRevokedSessionError`는 오류의 `cause` 체인 어디에든 `session revoked`가 있으면 true를 준다. 문자열
매칭인 이유는 그 정보가 문자열로만 존재하기 때문이다. 소켓이 서버 오류를 텍스트로 운반하므로 읽을 상태
코드가 없다. 순환 `cause`는 깊이 상한 5로 끊는다.

### 2. 감지 지점은 `auth.switch` 하나다

`switchSite`의 `catch`만 판정을 부른다. 다른 두 후보는 이 정보를 받을 수 없다.

| 경로                                         | revoke를 읽을 수 있나 | 이유                                                                                                 |
| -------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| `auth.switch`                                | 있다                  | `AuthSwitchError`가 서버 오류를 `cause`로 보존한다                                                   |
| `auth.refresh`                               | 없다                  | SDK `doRefresh`가 서버 오류를 버리고 `Error('auth.refresh failed: server')`로 던진다                 |
| 서명 HTTP (`clouds/0/list`·`delegate-cloud`) | 없다                  | API Gateway 403에 CORS 헤더가 없어 브라우저가 네트워크 실패로 보고한다 (`HttpManager`가 이미 문서화) |

`switchSite`는 판정 뒤에도 기존대로 낙관적 site를 롤백하고 오류를 다시 던진다. 호출자 계약은 바뀌지 않는다.

### 3. teardown은 `clearAndRedirect`다 — `logoutSession`이 아니다

`logoutSession`은 먼저 소켓 `auth.logout`을 쏘는데, 이미 revoke된 세션에는 같은 가드가 403을 준다. 더
revoke할 것도 없다. 필요한 것은 **로컬** teardown뿐이다. `relaySession.clearAndRedirect()`가 `/?logout=1`로
보내면 다음 문서의 `logoutStorageSweeper`가 저장된 토큰을 지운다. 그러면 `useRelaySessionKeepAlive`가
세션 부재를 보고 게스트 로그인을 돈다.

토큰 삭제가 이 모듈이 아니라 다음 문서의 청소에 있다는 분리는 의도된 것이다. 이 분리가 끊겼던 기간에
생긴 좀비 세션을 끝내려고 이 모듈이 생겼다.

### 4. 페이지 수명당 한 번만

revoke된 세션은 모든 요청을 실패시키므로, 리다이렉트가 실제로 이동하기 전에 판정이 여러 번 떨어질 수 있다.
모듈 플래그로 한 번만 처리하고, 테스트용 `resetRevokedSessionHandling`을 둔다.

## 대안 (Alternatives)

- **`isAuthenticated`를 유효성 판정으로 바꾼다** — 기각. 유효성은 서버 왕복 없이는 알 수 없고,
  ADR-0076이 정리한 판정 구조 전체에 걸린다. 이번 결함은 존재 판정이 틀려서가 아니라 revoke 신호를 아무도
  읽지 않아서 생겼다.
- **`logoutSession`으로 정상 로그아웃한다** — 기각. 첫 단계인 `auth.logout`이 403으로 실패한다(결정 3).
- **refresh·HTTP 경로에도 판정을 넣는다** — 보류. 두 경로 모두 전달 계층이 정보를 잃는다(결정 2 표).
  코드가 아니라 SDK·게이트웨이의 한계라 이 변경의 범위 밖이다.
- **`onTerminalExpiry`에 맡긴다(현상 유지)** — 기각. 끝나는 상태는 같지만, 그 전에 30초 동안 원인 모를
  403이 이어지고 기록도 남지 않는다.

## 결과 (Consequences)

### 얻는 것

- place 전환이 revoke를 만나면 즉시 게스트 세션으로 회복한다. 로그에 `[revokedSession]` 원인이 남는다.
- `switchSite.test.ts`의 revoke 케이스는 수정 없이 red다(11건 중 1건 실패). `revokedSession.test.ts` 6건이
  `cause` 체인, 비슷한 오류 3종(`invalid sign`·`refresh failed: server`·`not-connected`), 순환 `cause`를
  고정한다.

### 감수하는 트레이드오프

- **클라우드 타일만 누른 세션은 여전히 일반 토스트를 본다.** 클라우드 전환의 실패 지점은 서명 HTTP라
  revoke를 읽지 못한다. 그 경우는 기존 `onTerminalExpiry` 경로로 끝난다.
- 이메일·소셜 사용자는 다시 로그인해야 한다. revoke된 세션은 복구 대상이 아니며, 자동 로그아웃과 같은 끝
  상태에 더 빨리 도달할 뿐이다.

### 되돌리는 방법

`switchSite.ts`의 `isRevokedSessionError` 분기 한 곳을 지우면 이전 동작으로 돌아간다.

## 다음 단계

- 감지 범위를 넓히려면 sockets-lib의 `doRefresh`가 refresh 실패의 서버 오류를 `cause`로 보존해야 한다.
  그러면 `requestRelaySessionRefresh`의 `catch`에서 같은 판정을 부를 수 있다.
- 수동 검증은 미완이다: revoke된 세션으로 부팅한 뒤 place를 전환해 리다이렉트와 게스트 재로그인을 확인한다.
