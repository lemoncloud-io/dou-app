// @chatic/app-runtime — shared headless chat engine (data, sync, socket, auth bootstrap).
// Engine = how the app works; presentation lives in client apps. See docs/adr/0002.
//
// This barrel is the ONLY public surface. Everything is an explicit named export so internal
// wiring (socket auth bootstrap/reauth, connection binders, low-level socket types, raw session
// actions) stays private — apps consume the hooks/components/managers below, never those internals.
// See docs/public-surface.md.

// --- Value-deriving hooks -------------------------------------------------------------------
// `useRuntimeSocketSlots` is deliberately NOT here. It used to be (as `useRuntimeBinding`) because
// every app called it and handed the result back to the host; ADR-0076 G5 moved that derivation
// into the host, so app consumers dropped to zero — which is the exact category 결정 6 removed 32
// symbols from. Internal callers reach it by concrete path (`../runtime`), the convention this
// package already follows. Re-export it the day an app genuinely needs to inject slots.
export {
    useRuntimeRepositories,
    useRuntimeSocketState,
    useRuntimeProfile,
    useGlobalCacheSearch,
    globalCacheRefKey,
} from './runtime';
export type { SessionProfile } from './runtime';

// Per-kind (relay/cloud) verified state — for reactively gating a getScopedClient-pinned request,
// independent of which slot is ACTIVE. See useKindVerified's doc comment.
export { useKindVerified } from './runtime';

// --- Session action hooks (socket-driven site switch / logout) ------------------------------
// The session hub (ADR-0070) — store · auth use-cases · session hooks. This package is the single
// session surface; `@chatic/web-core`, which used to hold half of it, has been deleted.
export * from './session';

// 사용자 이슈 제보 + 로그 배치 업로드 (ADR-0070 결정 6). `http/` 밖에 있는 이유는 여기가 전송
// 계층이 아니기 때문이다 — 세션에서 payload를 조립하고 `report` repository로 부친다.
export * from './report';
// REST 데이터 훅 (구독·클라우드·사용자) — ADR-0070 4단계.
export * from './data/hooks';

// Web 런타임 설정·transport의 앱 대면 표면. env는 `@chatic/web-config`(import.meta 격리 leaf)에서,
// transport는 `http/transport`(조립 지점 — 실체는 `@chatic/http`)에서 재수출한다. ADR-0070의 목표
// 그림에서 앱이 보는 패키지는 app-runtime과 data 둘뿐이고, 나머지는 그 아래 조립 대상이기 때문이다.
export {
    LANGUAGE_KEY,
    WEB_ENV as ENV,
    WEB_PROJECT as PROJECT,
    WEB_SOCIAL_OAUTH_ENDPOINT as SOCIAL_OAUTH_ENDPOINT,
} from '@chatic/web-config';
// `hasStoredRelaySession`/`isStoredSessionExpired`는 내려갔다 — 읽기 전용 프로브이고 소비자가
// 런타임 내부(가드·부팅)뿐이다 (ADR-0076 결정 6).
export { startWebTransportInit, webTransport } from './http/transport';

// --- Session actions (non-hook) --------------------------------------------------------------
// verify-hash-alias `$token` → session/store commit + same-connection relay socket re-auth. Consumed by
// the phone-verification flow (roadmap ADR-0033 Track A contract; Track C imports it via apps/web).
export { applySessionToken } from './socket/auth/applySessionToken';
export type { ApplySessionTokenOptions } from './socket/auth/applySessionToken';
// The app-facing LOGOUTS — the socket halves. They notify each server's socket (`auth.logout`)
// before the local store teardown, which is why they and not the `session/auth` primitives are the
// public names (ADR-0076 결정 7; the primitives are now `clearSessionAndRedirect`/`clearCloudStores`
// and stay internal). `useSessionLogout`/`useLogoutCloudSession` wrap these for screens.
// `logoutSession` only: apps reach the cloud half through `useLogoutCloudSession`, so the raw
// `logoutCloudSession` stays internal (결정 6). `useRelaySessionGuard` in admin-v2 is the one
// non-React caller and it uses the relay half.
export { logoutSession } from './socket/auth/logoutSession';
// Foreground/wake kick for wedged sockets — apps call it on their own foreground signal (apps/web
// useSocketWakeRecovery; desktop-web keeps its local variant). See 2026-08 session audit §7 Phase 1.
export { recoverUnverifiedSockets } from './socket/auth/recoverUnverifiedSockets';
export type { RecoverUnverifiedSocketsDeps } from './socket/auth/recoverUnverifiedSockets';
// The single "make the relay credentials fresh" entry point — socket-owned refresh ONLY; no HTTP
// fallback (ADR-0070 불변조건 1·2). Returns false when there is no socket to ask, so callers recover
// the socket instead of routing around it. Replaces callers' own refresh engines.
// Relay only, by name: a cloud token is minted FROM the relay identity, so its recovery is a
// RE-ISSUE (renewCloudSession), not a refresh. The old `kind` parameter offered a door nobody should
// walk through.
// Internal: apps ask for freshness through `useSessionStalenessGuard` (apps/web
// `useRelayCredentialRefresh` does exactly that), never by calling the primitive.
export type { RequestRelaySessionRefreshDeps } from './socket/auth/requestRelaySessionRefresh';

// --- Cache tier helpers ---------------------------------------------------------------------
// Storage routing: which physical store each cache type lands in. See docs/data/cache-storage-routing.md.
export { isNativeApp } from './data/cacheStorageRouting';
// Native local-cache capability reported in the bridge handshake. The web ships ahead of the app,
// so a domain the installed app cannot store is routed to web storage instead of a silent void.
// `getNativeCacheSupport`는 내려갔다 — 읽기는 런타임 내부(로컬 팩토리)와 테스트 시임뿐이다.
export { setNativeCacheSupport } from './data/nativeCacheSupport';
export type { NativeCacheSupport } from './data/nativeCacheSupport';
// Data policies are no longer registered on their own — they ride `initAppRuntime({ data })` below,
// so an app has ONE boot call instead of a set of configure-* functions it must remember and order.
export type { DataRuntimeConfig } from './data/runtime';
export type { CacheAssemblyOptions } from './data/factories/localFactory';
// Native cache instrumentation read/reset — the debug overlay's only view into `@chatic/db`'s
// metrics module (ADR-0070 결정 5); it never imports the engine lib directly.
export { getCacheMetricsSource } from './data/factories/localFactory';
export {
    useInvitedCloudNameSync,
    recoverInvitedCloudIfMissing,
    syncInvitedCloudName,
} from './data/invitedCloudDurability';

// --- Sync registration hooks ----------------------------------------------------------------
export { useChatSync, useChannelSync, usePlaceSync } from './socket';

// --- Lifecycle ------------------------------------------------------------------------------
// Named (not `export *`) because connection/index.ts also re-exports deriveConnectivity, which is
// the testable inner truth table, not public surface.
export { RuntimeConnectionHost, RuntimeAuthHost, useConnectivity } from './connection';
export type { ConnectivityStatus } from './connection';
export { useDeviceTokenRegistration } from './push';
export type { DeviceTokenDelegate } from './push';

// --- Offline outbox -------------------------------------------------------------------------
// The machine only; ACTIVATION is the app's opt-in. apps/web never constructs one — it keeps its
// manual resend button, so this export cannot change mobile behaviour by existing.
export { createChatOutbox } from './data/outbox';
export type { ChatOutbox, ChatOutboxOptions, OutboxEntry, OutboxEnqueueInput } from './data/outbox';

// --- Boot ------------------------------------------------------------------------------------
// The one call every app entry makes before render. Replaces the import side effects that used to
// boot the session store and credential recovery; see its doc for the ordering contract.
export { initAppRuntime } from './init';
export type { AppRuntimeConfig } from './init';

// --- Manager entry points -------------------------------------------------------------------
export { getSocketManager, getSyncManager } from './socket/runtime';
export type { ISocketManager } from './socket';
