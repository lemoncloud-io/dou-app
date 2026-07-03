# Auth 서명·writeback 계약 (active-server-aware)

Date: 2026-06-29

> SDK `AuthController`가 요구하는 `authId` + `sign` 콜백을 앱(web-core 세션 레이어)이 **어디서 어떻게** 공급하고, SDK가 refresh한 토큰을 **어떻게 web-core로 되돌리는가**를 다룬다.
>
> - 공개 표면·상태 머신 → [README.md](./README.md)
> - 사용/도입 흐름 → [usage.md](./usage.md)

---

## 0. 왜 분기가 필요한가

active server는 두 종류다 — `relay` 또는 `cloud`(web-core [`ActiveServerContext`](../../../web-core/src/session/types.ts)). 소켓은 active server의 wss로 붙고, 인증 토큰도 active server의 `identityToken`이다. SDK `auth.refresh`는 `{ current, signature, authId }`를 보내 서버가 `/oauth/{authId}/refresh`로 forward하므로, **`authId`와 서명은 active server 토큰에 대응**해야 한다.

web-core에는 active server 통합 서명 헬퍼가 없다. relay/cloud 각각 출처가 다르므로 **분기하는 신규 헬퍼**를 둔다.

---

## 1. 출처 (relay vs cloud)

|           | token (register 초기값 / Authorization)                                                                        | authId + signature                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공통      | `getActiveServerIdentityToken()` ([web-core `session/contexts.ts`](../../../web-core/src/session/contexts.ts)) | —                                                                                                                                                                                                 |
| **relay** | 위                                                                                                             | `webTransport.getTokenSignature()` → `{ authId, current, signature, originToken }` (이미 [web-core `api/auth.ts` `refreshAuthToken`](../../../web-core/src/api/auth.ts)에서 사용)                 |
| **cloud** | 위                                                                                                             | `cloudCore.getCloudToken().Token`의 `{ authId, accountId, identityId }` → `calcSignature(payload, current)` ([web-core `transport/awsSigning.ts`](../../../web-core/src/transport/awsSigning.ts)) |

### 서명식은 token 문자열에 의존하지 않는다

`calcSignature`의 data는 `[current, accountId, identityId, '', userAgent]`이고 키는 `authId → accountId → identityId`로 중첩 hmac이다. **identityToken 자리는 항상 `''`** 다([api/auth.ts `refreshCloudToken`](../../../web-core/src/api/auth.ts)도 `identityToken:''`로 호출).

→ SDK가 sign 콜백 첫 인자로 주입하는 `token`은 **무시**하고, active server 기준으로 `{accountId, identityId, authId}`를 모아 서명한다. switch용(`ctx.target`)도 서명 자체는 동일하며, `target`은 SDK가 `auth.switch` 패킷에만 싣는다.

---

## 2. 신규 web-core 헬퍼 (delegate가 호출)

```ts
// active server 종류로 분기. cloud면 cloudToken.Token, relay면 webTransport.getTokenSignature().
export const getActiveServerAuthRegistration = (): Promise<{ token: string; authId: string } | null>;

// SDK sign 콜백 본문. token 인자는 무시(위 §1). target은 switch 식별용(서명 불변).
export const signActiveServerAuth = (target?: string): Promise<{ signature: string; current: string }>;

// SDK가 refresh/switch로 받은 토큰을 web-core 저장소로 단방향 writeback (§3).
export const commitSocketRefreshedToken = (view: AuthTokenView): Promise<void> | void;
```

app-runtime의 [`SocketSessionDelegate`](../../src/socket/types.ts)는 이를 `getAuthRegistration` / `signAuth(token, target?)` / `commitRefreshedToken(view)`로 노출하고, apps/web의 [`useSocketDelegate`](../../../../apps/web/src/app/runtime/useSocketDelegate.ts)가 위 헬퍼에 연결한다. (app-runtime은 web-core/data만 의존 — 3축 경계 준수.)

---

## 3. writeback 매핑 (`AuthTokenView` → web-core)

SDK `onTokenRefresh`/`switch`가 주는 [`AuthTokenView`](../../../../node_modules/@lemoncloud/chatic-sockets-lib/dist/lib/auth/contracts.d.ts)는 backend `UserTokenView`를 미러링한다:

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

`commitSocketRefreshedToken(view)`는 active server 종류로 분기해 저장:

- **cloud** → `cloudCore.saveCloudToken(merged)` (기존 cloudToken과 `view`를 merge — [`runRefreshCloudSession`](../../../web-core/src/session/services.ts)이 `{...cloudToken, ...refreshed}`로 하는 방식 참조) + credential 반영. 필요 시 `setSelectedSiteId`(switch).
- **relay** → relay 토큰 저장소 갱신(기존 `refreshRelaySession`/`validateTokenResponse` 경로의 저장 형태에 맞춤).

> 이 writeback이 빠지면 SDK는 갱신된 토큰을 갖지만 web-core(HTTP/REST·AWS 서명 경로)는 stale 토큰을 들고 있어 요청이 401로 샌다. 필드 매핑은 단위 테스트로 고정한다.

---

## 4. 검증 포인트

- relay/cloud 각각에서 `getActiveServerAuthRegistration`의 `authId`·`token` 출처가 맞는가.
- `signActiveServerAuth`가 active server 기준 `{signature, current}`를 내고, `target` 유무와 무관하게 서명이 동일한가(§1).
- `commitSocketRefreshedToken`이 종류별로 올바른 store(cloud/relay)에 쓰고, credential·sid가 반영되는가.
- switch 실패 시(`AuthSwitchError`) 기존 토큰/sid가 보존되는가(writeback 미수행).
