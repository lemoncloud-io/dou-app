// The session hub (ADR-0070 결정 1) — the single surface for session state, auth use-cases and the
// session hooks. `store` is the SSoT and is passive; `auth` holds the use-cases; `hooks` is the
// React surface. Env wiring is NOT an import side effect — `initAppRuntime()` runs
// `store/configure.ts` from the app entry point (ADR-0070 5단계).
//
// **This barrel publishes the APP surface only** (ADR-0074 결정 6). It used to `export *` the store,
// the services and the hooks, which put 27 runtime-internal symbols on the package's public API —
// every store writer among them. The docs said "this is not an invitation to drive the session
// directly" while `public-surface.test.ts` locked those symbols in as a contract; the rule was prose
// and the test worked against it.
//
// "Internal" now means: NOT on this list. Runtime code reaches those symbols by concrete module path
// (`../session/store`, `../session/auth/services`, `../session/hooks/app/...`) — the convention
// `connection/useSocketSessionDelegate.ts` already followed to bypass a barrel. No second barrel and
// no subpath export: no lib in this repo exposes one.

// --- store readers (앱이 읽는 세션 상태) ---------------------------------------------------------
export {
    getActiveServerContext,
    getActiveSessionUser,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    // `getSelectedCloudId` is public but `getSelectedSiteId` is not, and that asymmetry is measured
    // rather than designed: apps read the cloud id directly (deep links, cache scoping) while the
    // site id only ever reaches them through `useSessionSelection`. Add the sibling back the day a
    // real consumer appears, not to make the pair look tidy.
    getSelectedCloudId,
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
export type { LogoutOptions, ServerKind } from './auth/services';
export {
    createCredentialsByProvider,
    initializeRelaySession,
    loginRelaySocial,
    loginRelayUser,
    registerSessionLogoutCallback,
    switchCloudSession,
} from './auth/services';
// Invite login/lookup — ordinary auth actions; the module they live in is what stays off the barrel.
export { fetchInviteInfoWithCode, registerUserWithInviteCode } from './auth/authActions';

// --- React 표면 --------------------------------------------------------------------------------
export { SWITCH_SITE_MUTATION_KEY } from './hooks/mutationKeys';
export {
    useCloudCredentialGuard,
    useDynamicDeviceId,
    useRelaySessionInit,
    useServiceUnavailable,
    useSessionStalenessGuard,
} from './hooks/app';
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
    SWITCH_CLOUD_MUTATION_KEY,
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
