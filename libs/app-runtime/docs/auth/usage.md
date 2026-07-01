# Auth 사용 패턴 (app-runtime)

Date: 2026-06-29

> 앱/UI가 SDK `ClientSocketAuth`(`AuthController`)를 **어떻게 사용하는가**, 그리고 현재 수동 경로에서 **어떻게 도입(migration)하는가**를 다룬다.
>
> - 소유 경계·내부 동작·상태 머신 → [README.md](./README.md)
> - authId·서명·writeback 계약(relay vs cloud) → [signing.md](./signing.md)
> - sync target 등록(인증 완료가 전제) → [../sync/usage.md](../sync/usage.md)

---

## 1. 4가지 사용 흐름

### 1.1 부착 — `createClientSocketV2({ auth })`

`SocketManager.createClient`에서 `auth` 옵션을 넘긴다. `false`면 미부착, `undefined`면 기본값 부착, 객체면 옵션 부착이다.

```ts
return createClientSocketV2({
    url: this.normalizeUrl(config.url),
    device: { id: config.deviceId, platform: 'web' },
    auth: {
        refreshRatio: 0.8, // 만료 잔여시간의 80% 지점에 선제 refresh
        maxFailures: 3, // 백오프 N회 실패 → expired
        // refreshIntervalMs(=expiresIn 부재 시 fallback), minBackoffMs, maxBackoffMs,
        // backoffFactor, validatingTimeoutMs ...
    },
});
```

`start/stop/destroy`는 SDK(`create-client-socket-v2`)가 client 라이프사이클에 맞춰 자동 처리한다. 앱은 `client.auth`의 공개 메서드만 쓴다.

### 1.2 등록 — `register({ token, authId, sign })`

부팅 순서상 **device.save ack 관찰 후** 호출한다(§3 도입 단계). 서버는 device 링크 전 `auth.update`를 거부하므로, ack 후 register하면 SDK의 첫 `auth.update`가 곧장 통과한다.

```ts
const reg = await delegate.getAuthRegistration(); // { token, authId } — active-server-aware (signing.md)
client.auth.register({
    token: reg.token,
    authId: reg.authId,
    sign: (token, ctx) => delegate.signAuth(token, ctx?.target), // { signature, current }
});

await client.auth.ready(); // authenticated 까지 대기(만료 시 reject)
```

- `register`는 **멱등**이다. 재로그인/토큰 교체 시 다시 호출하면 된다.
- `expired` 상태에서 새 토큰으로 `register`하면 `pending`으로 복귀해 인증을 재개한다.
- `sign` 콜백은 토큰을 보관하지 않는다 — 매번 active server 기준으로 서명을 계산한다([signing.md](./signing.md)).

### 1.3 토큰 사용 + 상태/갱신 구독

```ts
// HTTP Authorization 헤더 — SDK 보유 현재 토큰(identityToken 문자열)
const token = client.auth.token;

// 갱신마다 full payload(Token.credential = AWS AccessKey/Secret/Session 포함).
// SDK 주도 주기 refresh·switch 분 모두 여기로 온다. → web-core 저장소로 writeback.
const offToken = client.auth.onTokenRefresh(view => {
    void delegate.commitRefreshedToken(view); // SDK SSoT → web-core (HTTP/AWS 서명용)
});

// 인증 상태 — isVerified 등 앱 상태로 매핑
const offState = client.auth.onAuthState(state => {
    manager.setVerified(state === 'authenticated');
    if (state === 'expired') void delegate.onAuthExpired(); // 로그아웃 트리거
});
```

> ⚠️ `onTokenRefresh`의 view에는 **AWS credential이 그대로 노출**된다 — 기존 프론트가 `/oauth/refresh`에서 받던 형태와 동일한 **의도된 노출**이다. writeback 매핑은 [signing.md](./signing.md) §3.

### 1.4 사이트 전환 / 로그아웃

```ts
// 전환: 일회성 명시 호출. 실패해도 기존 세션/sid 보존, expired 경로 안 탐.
// target = `${uid}@${siteId}`. switch 성공분도 onTokenRefresh로 와서 writeback된다.
try {
    const view = await client.auth.switch(`${uid}@${siteId}`, {
        onSuccess: res => {
            /* 새 토큰 적용됨 */
        },
        onError: err => {
            /* err.phase: 'not-connected' | 'sign' | 'server' */
        },
    });
} catch (e) {
    if (e instanceof AuthSwitchError) {
        /* e.phase */
    }
}

// 로그아웃: best-effort 서버 통지 후 로컬 정리, 상태 '' 복귀(예외 안 던짐)
await client.auth.logout();
```

> **switch vs 소켓 재생성**: `switch`는 **같은 소켓 내 site 변경**에만 쓴다. active server 종류가 바뀌어(`relay`↔`cloud`) wss URL이 달라지면 그것은 switch가 아니라 **새 소켓 생성**이며, `SocketBinder`가 재부팅(register)으로 처리한다. 이 분기 판단은 binder가 한다.

---

## 2. 사용 원칙

1. **소켓 토큰 갱신 타이머를 앱이 돌리지 않는다** — 만료 기반 refresh·재연결 재인증·실패 백오프는 SDK 자동. 앱은 토큰 교체(`register`)와 사이트 전환(`switch`)만 명시적으로 한다. SDK가 SSoT.
2. **토큰은 읽고 흘려보낸다** — `client.auth.token`/`onTokenRefresh`로 읽고, refresh 결과는 web-core로 **writeback**해 HTTP/AWS 서명 경로와 일치시킨다([signing.md](./signing.md)).
3. **switch는 일회성** — 실패는 타입드 에러(`AuthSwitchError.phase`)로만 받고, 주기 백오프·`expired` 경로로 넘기지 않는다. 기존 sid는 보존된다.
4. **sync 등록 전에 `ready()`** — `requiresAuth` plan은 `authenticated` 전엔 안 돈다([README.md](./README.md) §4). 부팅은 `register → ready → registerChat/Channel` 순서.
5. **UI 직접 노출 금지** — `client.auth`는 socket/세션 레이어가 감싼다. UI는 매핑된 앱 상태(예: `isVerified`)와 repository 스트림만 본다([../architecture.md](../architecture.md) 소유 규칙).

---

## 3. 도입(migration) — 수동 경로에서 SDK로

현재 인증은 [`SocketSessionController`](../../src/socket/SocketSessionController.ts)가 수동으로 한다. SDK `AuthController` 도입 시 아래가 대체된다.

| 현재(수동)                                                                                       | → SDK `AuthController`                                            | 비고                                                                                                     |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `updateAuth(...)` → `client.request('auth.update', {token})`                                     | `register({token,authId,sign})` + `onState=connected` 자동 update | SDK가 connected마다 auth.update                                                                          |
| `startPeriodicRefresh`(1분 `setInterval`)                                                        | `expiresIn × refreshRatio` 만료 기반 자동 refresh                 | 고정 1분 → 토큰 수명 기반                                                                                |
| `handle401Recovery`(single-flight + `delegate.refreshSocketToken`)                               | `failed`/`:error` → 백오프 reauth                                 | epoch 단일 in-flight가 single-flight 대체                                                                |
| [`SocketAuthBinder`](../../src/connection/SocketAuthBinder.tsx) → `updateAuth('session-switch')` | **파일 삭제** — site 전환은 `client.auth.switch(`uid@sid`)`       | token 변경 관찰 재인증은 `onTokenRefresh` writeback과 피드백 루프를 만들어 제거. 종류 변경은 소켓 재생성 |
| `delegate.getSocketToken()`                                                                      | `register({token})` 초기값 + `delegate.getAuthRegistration()`     |                                                                                                          |
| `delegate.refreshSocketToken(reason)`                                                            | `delegate.signAuth` 콜백(lemon hmac)                              | SDK가 `auth.refresh`로 backend forward                                                                   |
| (HTTP refresh가 web-core 저장소 갱신)                                                            | `onTokenRefresh` → `delegate.commitRefreshedToken(view)`          | SDK SSoT → web-core 단방향                                                                               |
| `markVerified()` / `markUnverified()`(`isVerified`)                                              | `onAuthState(s => setVerified(s === 'authenticated'))`            |                                                                                                          |
| `device.save:` ack 관찰 후 auth                                                                  | 그대로 유지 — ack 후 `register`                                   | device 링크 전엔 서버가 auth.update 거부 — SDK도 동일 전제                                               |

### 도입 단계

1. **web-core에 active-server-aware 헬퍼 신설** — `getActiveServerAuthRegistration()`, `signActiveServerAuth(target?)`, `commitSocketRefreshedToken(view)` (relay/cloud 분기). 상세 계약 → [signing.md](./signing.md).
2. **delegate 계약 확장** — `SocketSessionDelegate`에 `getAuthRegistration`/`signAuth`/`commitRefreshedToken`/`onAuthExpired` 추가, `refreshSocketToken`/`onRefreshFailed` 제거. `useSocketDelegate`를 신설 헬퍼에 연결.
3. `SocketManager.createClient`의 `createClientSocketV2`에 `auth` 옵션을 넘긴다(§1.1).
4. **`SocketSessionController` 클래스 삭제 + bootstrap을 순수 함수로 이관** — 부팅 시퀀스(`ensure` → `connect` → `device.save` ack 대기 → `updateAuth` 대신 **`client.auth.register(...)` + `await client.auth.ready()`**)를 `bootstrapSocketConnection({ manager, config, delegate })` 함수로 옮기고, `SocketBinder`가 이를 호출한다. 상태를 들고 있는 controller 클래스는 두지 않는다. `getSocketRuntime()` 공개 표면과 `createSocketRuntime()` 조립에서 `sessionController`를 제거하고, `setRecoveryHandler` 주입 배선도 삭제한다.
5. `onAuthState`를 `SocketManager`의 `isVerified`(`setVerified`)에 매핑하고, `onTokenRefresh`를 web-core writeback(`delegate.commitRefreshedToken`), `expired`를 `delegate.onAuthExpired`에 연결한다(§1.3). 이 구독 배선은 `bootstrapSocketConnection` 안에서 하고, 반환 cleanup으로 해제한다.
6. `startPeriodicRefresh`/`handle401Recovery`를 제거하고, `SocketAuthBinder.tsx`는 **파일 삭제**한다(identity token 변경 관측 재인증은 `onTokenRefresh` writeback과 피드백 루프를 만들어 제거). 사이트 전환은 `client.auth.switch(`uid@sid`)`로 옮긴다.
7. sync 등록을 `ready()` 이후로 정렬한다(이미 `requiresAuth` 게이트가 있어 순서만 맞추면 됨).
8. **web-core 주기 refresh를 per-app 게이트** — `useTokenRefresh`의 `setInterval`을 AuthController 활성 앱(apps/web)에서만 끈다. `admin`은 유지([README.md](./README.md) §5 주의).

> 서버 패킷(`auth.refresh`/`auth.switch`/`auth.logout`)은 chatic-sockets-api에 모두 배선·forward 확인됨([README.md](./README.md) §3). 도입 범위를 `auth.update`로 제한할 필요는 없다.

---

## 4. 트러블슈팅

| 증상                               | 원인 후보                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 계속 `pending`, 인증 안 됨         | `register()` 미호출, 또는 device 링크 전에 register(ack 관찰 전) → 서버가 `auth.update` 거부                                   |
| 곧장 `expired`로 감                | `sign` 콜백 reject 반복(active server 토큰 필드 누락 — signing.md), 또는 백오프 소진                                           |
| HTTP 요청이 stale 토큰으로 실패    | `onTokenRefresh` → `commitRefreshedToken` 미연결(writeback 누락), 또는 cloud/relay 매핑 오류(signing.md §3)                    |
| sync가 안 돎                       | `authenticated` 전에 `registerChat` 호출 — `requiresAuth` 게이트에 막힘(§2.4)                                                  |
| switch 후 토큰 안 바뀜             | `onSuccess`/`onTokenRefresh` 미구독, 또는 `AuthSwitchError.phase==='server'`(서명 불일치·권한 없는 target)                     |
| site 전환했는데 재인증이 안 일어남 | 종류 변경(relay↔cloud)인데 switch로 처리 — 새 소켓 생성/재부팅 경로여야 함(§1.4)                                              |
| admin 토큰이 안 갱신됨             | web-core 주기 refresh를 전역 삭제 — AuthController 미사용 앱은 `useTokenRefresh` 주기 유지해야 함([README.md](./README.md) §5) |
| 재연결 후 stale 토큰 적용          | (SDK가 epoch로 방어) 앱이 별도 토큰 캐시를 들고 덮어쓰는 경우 — 토큰은 SDK SSoT만 신뢰                                         |
