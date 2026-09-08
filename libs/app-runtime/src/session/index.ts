// The session hub (ADR-0070 결정 1) — the single surface for session state, auth use-cases and the
// session hooks. `store` is the SSoT and is passive; `auth` holds the use-cases; `hooks` is the
// React surface. Env wiring is NOT an import side effect — `initAppRuntime()` runs
// `store/configure.ts` from the app entry point (ADR-0070 5단계).
//
// **This barrel publishes the APP surface only** (ADR-0076 결정 6). It used to `export *` the store,
// the services and the hooks, which put 27 runtime-internal symbols on the package's public API —
// every store writer among them. The docs said "this is not an invitation to drive the session
// directly" while `public-surface.test.ts` locked those symbols in as a contract; the rule was prose
// and the test worked against it.
//
// "Internal" now means: NOT on this list. Runtime code reaches those symbols by concrete module path
// (`../session/store`, `../session/auth/relaySession`, `../session/hooks/app/...`) — the convention
// `connection/hooks/useSocketSessionDelegate.ts` already followed to bypass a barrel. No second barrel and
// no subpath export: no lib in this repo exposes one.

// --- store readers (앱이 읽는 세션 상태) ---------------------------------------------------------
export {
    getActiveServerContext,
    getActiveSessionUser,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    // The account-profile read/write pair. Kept public because the local cache cannot answer this
    // question — its physical key is `${type}:${cid}:${uid}:${id}` and the read path ignores context
    // overrides, so while a cloud is active the relay `user` row is unreachable (ADR-0062). apps/web
    // uses both.
    patchRelaySessionUser,
} from './store';
export type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './store';

// --- auth use-cases (비-React) -----------------------------------------------------------------
export type { LogoutOptions, ServerKind } from './auth/relaySession';
// Only these two. The other use-cases reach apps through their hooks (`useLogin` ·
// `useLoginRelaySocial` · `useSwitchCloudSession` · `useRelaySessionInit`), and 결정 6's rule is
// "the barrel sells what apps import" — so the raw functions stay internal. OAuth exchange and the
// logout-callback registry have no hook because their callers are not React (an OAuth redirect
// page's effect, a log uploader's module init).
export { createCredentialsByProvider, registerSessionLogoutCallback } from './auth/relaySession';
// Invite login/lookup — ordinary auth actions; the module they live in is what stays off the barrel.
export { fetchInviteInfoWithCode, registerUserWithInviteCode } from './auth/authActions';

// --- React 표면 --------------------------------------------------------------------------------
export { SWITCH_CLOUD_MUTATION_KEY, SWITCH_SITE_MUTATION_KEY } from './hooks/mutationKeys';
export { useCloudCredentialGuard, useDynamicDeviceId, useSessionStalenessGuard } from './hooks/app';
export type { CloudCredentialPolicy, SessionStalenessPolicy } from './hooks/app';
export {
    useFindAlias,
    useInviteInfo,
    useLogin,
    useLoginRelayGuestByDevice,
    useLoginRelaySocial,
    useRegisterUserV2,
    useVerifyAlias,
} from './hooks/auth';
export {
    useGlobalSession,
    useInviteFlow,
    useLogoutCloudSession,
    useSessionAuth,
    useSessionIdentity,
    useSessionLogout,
    useSessionSelection,
    useSiteSwitch,
    useSwitchCloudSession,
} from './hooks/session';

// --- 세션 액션·프로필 (다른 폴더에 살지만 세션 그룹이다) -----------------------------------------
// The facade groups by what a CONSUMER is doing, not by which folder the file sits in. These three
// are session concepts whose implementations belong to other modules for good reasons — the two
// actions drive a socket, and the profile hook assembles from repositories — so the barrel is where
// that gap closes instead of making an app know the split.

// verify-hash-alias `$token` → session/store commit + same-connection relay socket re-auth. Consumed
// by the phone-verification flow (roadmap ADR-0033 Track A contract; Track C imports it via apps/web).
export { applySessionToken } from '../socket/auth/applySessionToken';
export type { ApplySessionTokenOptions } from '../socket/auth/applySessionToken';
// The app-facing relay LOGOUT — the socket half. It notifies the server's socket (`auth.logout`)
// before the local store teardown, which is why it and not the `session/auth` primitive is the
// public name (ADR-0076 결정 7). The cloud half is reached through `useLogoutCloudSession`, so the raw
// `logoutCloudSession` stays internal (결정 6); admin-v2's `useRelaySessionGuard` is the one non-React
// caller of this one.
export { logoutSession } from '../socket/auth/logoutSession';
// The session user's profile, assembled from the user repository + the live session context.
export { useRuntimeProfile } from './hooks/session/readers/useRuntimeProfile';
export type { SessionProfile } from './hooks/session/readers/useRuntimeProfile';
