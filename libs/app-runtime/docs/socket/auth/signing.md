# Auth 서명·writeback 계약 (per-socket kind-aware)

Date: 2026-07-10

> SDK `AuthController`가 요구하는 `authId` + `sign` 콜백을 `session/`(세션 허브)이 **어디서 어떻게** 공급하고, SDK가 refresh한 토큰을 **어떻게 `session/store`로 되돌리는가**를 다룬다. 듀얼 소켓(relay + cloud) 도입 이후, 이 계약은 전역 active server가 아니라 **각 소켓의 `kind`** 를 축으로 분기한다.
>
> - 공개 표면·상태 머신 → [README.md](./README.md)
> - 배선/사용 흐름 → [usage.md](./usage.md)

---

## 0. 왜 kind로 분기하는가 (active server 아님) ⚠️

인증 대상 서버는 두 종류다 — `relay` 또는 `cloud`. 소켓은 각 서버의 wss로 붙고, 인증 토큰도 각 서버의 `identityToken`이다. SDK `auth.refresh`는 `{ current, signature, authId }`를 보내 서버가 `/oauth/{authId}/refresh`로 forward하므로, **`authId`와 서명은 그 소켓 서버의 토큰에 대응**해야 한다.

듀얼 소켓에서는 relay·cloud 두 소켓이 **동시에** 각자 refresh/sign을 돌린다. 서명·seed·writeback을 전역 `getActiveServer…`로 분기하면 **cloud 활성 중 relay refresh가 도착했을 때 cloud로 오라우팅**되어 relay credential이 stale해진다(하드 블로커). 따라서 delegate는 소켓 생성 시점에 고정된 **`kind` 클로저**로 분기한다 — SDK `AuthTokenView.cloudId`는 relay 토큰에도 실릴 수 있어 신뢰 불가(dist 확인).

---

## 1. 출처 (relay vs cloud)

> ⚠️ **relay의 authId는 `$auth.id`다 (`Token.authId` 아님).** relay 소켓 서버의 `auth.update`/`auth.refresh`는 auth model을 `$auth.id`로 조회하고 **서명도 `$auth.id`를 HMAC 키로** 검증한다. register의 authId와 sign의 서명 authId가 둘 다 `$auth.id`여야 하며, `Token.authId`(HTTP `/oauth/{authId}/refresh`용 id)를 쓰면 서버가 다른 서명을 계산해 `no auth model`로 영구 실패한다. 그래서 relay 서명은 `getTokenSignature()`(= `Token.authId` 기반, HTTP 경로) 재사용을 **버리고 `$auth.id`로 직접 계산**한다. **cloud는 반대로 `Token.authId`를 쓴다** — exchange-token으로 발급된 cloud 토큰은 그 id로 키잉된다(커밋 a535055a에서 정렬; 이 표의 옛 `$auth.id` 표기는 2026-08 session audit §5-10에서 정정).

|           | token (register 초기값 / Authorization)        | authId (register + 서명 HMAC 키) + signature                                                                                              |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **relay** | `relayStore.getIdentityToken()`                | `relayStore.getRelayToken()`의 `$auth.id` + `Token.{accountId, identityId}` → `calcSignature(payload, current)` (`@chatic/auth-sign`)     |
| **cloud** | `cloudStore.getIdentityToken()` (= cloudToken) | `cloudStore.getCloudToken()`의 `Token.authId` + `Token.{accountId, identityId}` → `calcSignature(payload, current)` (`@chatic/auth-sign`) |

### 서명식은 token 문자열에 의존하지 않는다

`calcSignature`의 data는 `[current, accountId, identityId, '', userAgent]`이고 키는 `authId → accountId → identityId`로 중첩 hmac이다. **identityToken 자리는 항상 `''`** 다 — 지금은 사라진 HTTP refresh도 같은 규칙으로 서명했다.

→ SDK가 sign 콜백 첫 인자로 주입하는 `token`은 **무시**하고, `kind` 기준으로 `{accountId, identityId, authId}`를 모아 서명한다. switch용(`ctx.target`)도 서명 자체는 동일하며, `target`은 SDK가 `auth.switch` 패킷에만 싣는다.

---

## 2. per-server 세션 헬퍼 (delegate가 kind로 호출)

```ts
// register 시드: 명시적 kind 기준 { token, authId }
export const getServerAuthRegistration = (kind: 'relay' | 'cloud'): Promise<{ token: string; authId: string } | null>;

// SDK sign 콜백 본문: 명시적 kind 기준 (token 인자는 무시 — §1). target은 switch 식별용(서명 불변).
export const signServerAuth = (kind: 'relay' | 'cloud', target?: string): Promise<{ signature: string; current: string }>;

// SDK가 refresh/switch로 받은 토큰을 kind 저장소로 단방향 writeback (§3).
export const commitServerRefreshedToken = (kind: 'relay' | 'cloud', view: AuthTokenView): Promise<void> | void;
```

app-runtime의 [`SocketSessionDelegate`](../../../src/socket/auth/types.ts)는 이를 **모두 kind 인자로** 노출한다 — `getAuthRegistration(kind)` / `signAuth(kind, token, target?)` / `commitRefreshedToken(kind, view)` / `onAuthExpired(kind)`. 배선은 app-runtime의 [`useSocketSessionDelegate`](../../../src/connection/useSocketSessionDelegate.ts)가 소유하며, `kind`는 소켓 부팅 시([`bootstrapSocketConnection`](../../../src/socket/auth/bootstrapSocketConnection.ts)) SocketBinder가 슬롯별로 명시 전달한 값으로 고정돼 클로저로 흐른다. (세션 재료는 `session/store`에서 오고, 서명 계산은 leaf인 `@chatic/auth-sign`이 한다.)

---

## 3. writeback 매핑 (`AuthTokenView` → `session/store`, per-socket 라우팅)

SDK `onTokenRefresh`/`switch`가 주는 [`AuthTokenView`](../../../../../node_modules/@lemoncloud/chatic-sockets-lib/dist/lib/auth/contracts.d.ts)는 backend `UserTokenView`를 미러링한다:

```ts
interface AuthTokenView {
    id: string;
    accountId?: string;
    userRole?: string;
    userStatus?: string;
    Token?: { authId?; accountId?; identityId?; identityPoolId?; identityToken?; credential? };
    $auth?: { id; accountId?; userId?; siteId?; refreshedAt? };
    cloudId?: string;
}
```

`commitServerRefreshedToken(kind, view)`는 **`kind`로 분기**해 저장한다 (전역 active 참조 금지):

- **cloud** → `cloudStore.saveCloudToken({ ...cloudToken, ...view })` **단일 쓰기**. cloud는 **HTTP 서명이 없다** — 클라우드 자격증명으로 서명하던 유일한 요청(클라우드 HTTP refresh)은 ADR-0070이 지웠고, 클라우드 host로 가는 요청은 relay 서명을 탄다. cloud 토큰이 계속 갚아야 하는 것은 **소켓 서명**(`signServerAuth('cloud')`)이고 그건 패킷마다 store를 라이브 읽기하므로 store 갱신만으로 충분하다. (switch 시 sid 선반영/롤백은 writeback이 아니라 `switchSite`의 optimistic `applySelectedSite`가 소유.)
- **relay** → **이중 쓰기 필수**: `await webTransport.buildCredentialsByToken(view.Token)`로 **AWS credential 캐시**를 먼저 갱신한 뒤 `relayStore.saveRelayToken({ ...relayToken, ...view })`. relay signed HTTP는 토큰 "문자열"이 아니라 credential 번들을 소비하므로, credential 캐시를 빠뜨리면 store만 신선하고 서명은 stale(비대칭).
- 두 경우 모두 이후 `rebuildSessionIdentity()`로 파생 identity 갱신.

> 이 writeback이 빠지거나 잘못된 kind로 라우팅되면, SDK는 갱신 토큰을 갖지만 `session/store`(HTTP·AWS 서명 경로가 읽는 곳)는 stale 토큰을 들고 있어 요청이 403/401로 샌다. 필드 매핑·kind 라우팅은 단위 테스트로 고정한다.

---

## 4. 검증 포인트

- relay/cloud 각각에서 `getServerAuthRegistration(kind)`의 `authId`·`token` 출처가 맞는가 (relay=relayStore/webTransport, cloud=cloudStore).
- `signServerAuth(kind, target?)`가 kind 기준 `{signature, current}`를 내고, `target` 유무와 무관하게 서명이 동일한가(§1).
- `commitServerRefreshedToken(kind, view)`가 종류별로 올바른 store에 쓰는가 — **relay는 credential 캐시(`buildCredentialsByToken`) + store 이중 쓰기**, cloud는 store 단일 쓰기 + 라이브 읽기.
- cloud 활성 중 relay refresh가 도착해도 **relay store로만** 라우팅되는가(kind 클로저, §6-6).
- switch 실패 시(`AuthSwitchError`) 기존 토큰/sid가 보존되는가(writeback 미수행).
