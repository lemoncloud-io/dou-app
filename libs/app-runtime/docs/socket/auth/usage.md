# Auth 사용 패턴 (app-runtime)

> app-runtime이 SDK `ClientSocketAuth`(`AuthController`)를 **어떻게 배선·사용하는가**를 다룬다.
>
> - 소유 경계·내부 동작·상태 머신 → [README.md](./README.md)
> - per-kind authId·서명·writeback 계약 → [signing.md](./signing.md)
> - sync target 등록(인증 완료가 전제) → [../sync/usage.md](../sync/usage.md)

---

## 1. 배선 흐름

### 1.1 부착 — `createClientSocketV2({ auth })`

`SocketManager.createClient`가 모든 client에 `auth: AUTH_OPTIONS`를 넘긴다(값·근거 → [README.md §2](./README.md)). `start/stop/destroy`는 SDK가 client 라이프사이클에 맞춰 자동 처리한다. app-runtime은 `client.auth`의 공개 메서드만 쓴다.

### 1.2 부팅 등록 — `bootstrapSocketConnection`

각 소켓 슬롯(relay/cloud)의 부팅은 순수 함수 [`bootstrapSocketConnection({ manager, kind, config, delegate })`](../../../src/socket/auth/bootstrapSocketConnection.ts)가 시퀀싱한다. 순서는 **`ensure` → 구독 → `register` → `connect`** 이며, `register`가 `connect`보다 **먼저**다(근거 → [README.md §3](./README.md)).

```ts
// kind는 SocketBinder가 슬롯별로 명시 전달한다 (config에서 재유도하지 않음).
const client = manager.ensure(config, kind);
const auth = client.auth;

// 상태·갱신 구독 (반환 cleanup으로 해제)
const offState = auth.onAuthState(state => {
    manager.setAuthenticated(kind, state === 'authenticated');
    if (state === 'expired') void delegate.onAuthExpired?.(kind);
});
const offRefresh = auth.onTokenRefresh(view => {
    void delegate.commitRefreshedToken(kind, view); // SDK SSoT → web-core writeback
});

// register로 토큰만 시드한 뒤 stop()으로 게이트를 닫는다 — SDK의 onState('connected')
// 자동 발사를 억제하고, auth.update는 device.save:ok 이후 start()로 지연 발사한다.
const registration = await delegate.getAuthRegistration(kind); // { token, authId } — per-kind (signing.md)
if (registration) {
    auth.register({
        token: registration.token,
        authId: registration.authId,
        sign: (token, ctx) => delegate.signAuth(kind, token, ctx?.target),
    });
    gate.stop(); // 게이트 닫기 (gate = auth as { start(); stop() } — 인터페이스 밖 impl 메서드)
    // device 선등록 후에만 auth.update 발사; 재연결 대비 disconnect마다 게이트 재폐쇄.
    // device.save:ok는 device.save 요청의 응답이라 onType이 아닌 onMessage로만 온다.
    offDeviceSaved = client.onMessage(e => {
        if (e.message?.type === 'device.save:ok') gate.start();
    });
    offState = client.onState(e => {
        if (e.next === 'closed' || e.next === 'closing' || e.next === 'idle') gate.stop();
    });
}

await manager.connect(kind);
```

- **`auth.update`는 `device.save:ok` 이후에만 발사** — 백엔드는 device 선등록 없이는 `auth.update`를 처리 못 하고, 실패 시 재시도되지 않아 `expired`로 끝난다. 그래서 SDK의 connect-time 자동 발사를 stop/start 게이트로 억제·지연시킨다([README.md §3](./README.md)).
- **`client.auth.ready()`를 부팅에서 호출하지 않는다** — sync는 `requiresAuth` 게이트가, UI는 `useRuntimeSocketState().isVerified`가 인증 완료를 관측한다.
- delegate 메서드는 **모두 `kind` 인자**를 받는다([signing.md §2](./signing.md)).

### 1.3 same-connection 재인증 — `reauthenticateActiveSocket`

같은 연결에서 토큰만 바뀌는 경우(게스트→소셜 승격, 같은 wss cloud site 전환)는 bare `register`로 재인증되지 않는다. [`SocketReauthBinder`](../../../src/connection/SocketReauthBinder.tsx)가 각 슬롯의 `identityToken` 변화를 관측해 [`reauthenticateActiveSocket({ manager, delegate, kind })`](../../../src/socket/auth/reauthenticateActiveSocket.ts)를 호출한다. 내부는 `token===auth.token` no-op 가드 + `logout → register` resume 경로다(상세 → [README.md §3](./README.md)).

### 1.4 토큰 사용 + 구독

```ts
const token = client.auth.token; // HTTP Authorization 헤더 (identityToken 문자열)

const offToken = client.auth.onTokenRefresh(view => {
    void delegate.commitRefreshedToken(kind, view); // full payload(Token.credential=AWS creds 포함)
});

const offState = client.auth.onAuthState(state => {
    manager.setAuthenticated(kind, state === 'authenticated'); // isVerified = authenticated && connected
    if (state === 'expired') void delegate.onAuthExpired(kind);
});
// SDK는 'disconnected'를 방출하지 않는다(타입엔 있으나 미사용) — onAuthState에서 기대하지 말 것.
```

> ⚠️ `onTokenRefresh`의 view에는 **AWS credential이 그대로 노출**된다 — 기존 프론트가 `/oauth/refresh`에서 받던 형태와 동일한 **의도된 노출**이다. writeback 매핑은 [signing.md §3](./signing.md).

### 1.5 사이트 전환 / 로그아웃 (socket 헬퍼)

app-runtime은 `client.auth`를 직접 노출하지 않고 socket 레벨 헬퍼로 감싼다([../socket/README.md](../README.md)):

- **[`switchSite(siteId)`](../../../src/socket/auth/switchSite.ts)** — 같은 소켓 내 site 변경. optimistic `applySelectedSite(siteId)` → `manager.waitUntilVerified()` → `client.auth.switch(`${uid}@${siteId}`)`. 실패 시 이전 sid로 롤백하고 rethrow. active server 종류가 바뀌면(relay↔cloud, wss URL 변경) switch가 아니라 **새 소켓 생성**이며 `SocketBinder` 재부팅이 처리한다.
- **[`logoutSession(options?)`](../../../src/socket/auth/logoutSession.ts)** — 두 슬롯에 best-effort `auth.logout()` 통지 후 `logoutRelaySession()`(relay/cloud 토큰·credential 전체 로컬 정리 + redirect). relay 토큰이 사라지면 두 binding 슬롯이 모두 내려가 `SocketBinder`가 client를 tear down.
- **[`logoutCloudSession()`](../../../src/socket/auth/logoutCloudSession.ts)** — cloud 슬롯에 best-effort `auth.logout()` 후 web-core cloud teardown(cloudCore만 정리). cloud 슬롯만 내려가고 relay는 유지된다. (web-core의 동명 `logoutCloudSession`은 `clearCloudCoreSession`으로 alias해 소비.)

```ts
// switch 원형: 실패해도 기존 세션/sid 보존
const view = await client.auth.switch(`${uid}@${siteId}`, {
    onSuccess: res => {
        /* 새 토큰 적용됨 (onTokenRefresh로도 writeback) */
    },
    onError: err => {
        /* err.phase: 'not-connected' | 'sign' | 'server' */
    },
});
```

---

## 2. 사용 원칙

1. **소켓 토큰 갱신 타이머를 app-runtime이 돌리지 않는다** — 만료 refresh·재연결 재인증·실패 백오프는 SDK 자동. app-runtime은 부팅 `register`, same-connection 재인증(`reauthenticateActiveSocket`), 사이트 전환(`switchSite`)만 명시한다.
2. **토큰은 읽고 흘려보낸다** — `client.auth.token`/`onTokenRefresh`로 읽고, refresh 결과는 per-kind로 web-core에 **writeback**해 HTTP/AWS 서명 경로와 일치시킨다([signing.md](./signing.md)).
3. **switch는 일회성** — 실패는 타입드 에러(`AuthSwitchError.phase`)로만 받고, 주기 백오프·`expired` 경로로 넘기지 않는다.
4. **UI 직접 노출 금지** — `client.auth`는 socket/delegate 레이어가 감싼다. UI는 매핑된 앱 상태(`useRuntimeSocketState`)와 repository 스트림만 본다.
5. **delegate는 per-kind** — 모든 delegate 호출에 소켓 `kind`를 넘겨 relay/cloud 토큰이 교차 오염되지 않게 한다([signing.md §0](./signing.md)).

---

## 3. 트러블슈팅

| 증상                               | 원인 후보                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 계속 `pending`, 인증 안 됨         | `getAuthRegistration(kind)`가 null → `register()` 미호출로 발사할 토큰 없음                                |
| 인증이 "첫 재연결 후에만" 됨       | `register`를 `connect` **후**에 호출(순서 위반) → connected가 빈 토큰으로 지나감                           |
| 곧장 `expired`로 감                | `sign` 콜백 reject 반복(kind 토큰 필드 누락 — signing.md), 또는 백오프 소진(`maxFailures` 3 초과)          |
| HTTP 요청이 stale 토큰으로 실패    | `commitRefreshedToken` 미연결(writeback 누락), 또는 cloud/relay **kind 라우팅 오류**(signing.md §3)        |
| cloud 활성 중 relay 요청이 403     | relay refresh writeback이 잘못된 kind로 라우팅됨 — kind 클로저 확인(signing.md §0)                         |
| sync가 안 돎                       | `authenticated` 전에 등록된 채로 `requiresAuth` 게이트에 막힘 — 인증되면 자동 시작                         |
| 게스트→소셜 승격 후 옛 신원 유지   | same-connection 토큰 교체인데 `SocketReauthBinder`/`reauthenticateActiveSocket` 미동작(§1.3)               |
| switch 후 토큰 안 바뀜             | `onSuccess`/`onTokenRefresh` 미구독, 또는 `AuthSwitchError.phase==='server'`(서명 불일치·권한 없는 target) |
| site 전환했는데 재인증이 안 일어남 | 종류 변경(relay↔cloud)인데 switch로 처리 — 새 소켓 생성/재부팅 경로여야 함(§1.5)                          |
