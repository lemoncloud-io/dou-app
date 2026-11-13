// The session hub (ADR-0070 Decision 1) — the single surface for session state, auth use-cases and the
// session hooks. `store` is the SSoT and is passive; `auth` holds the use-cases; `hooks` is the
// React surface. Env wiring is NOT an import side effect — runtime-core's `createRuntime()` runs
// `store/configure.ts`, called from the app's entry point.
//
// **This barrel publishes the APP surface only** (ADR-0076 Decision 6). It used to `export *` the store,
// the services and the hooks, which put 27 runtime-internal symbols on the package's public API —
// every store writer among them. The docs said "this is not an invitation to drive the session
// directly" while `public-surface.test.ts` locked those symbols in as a contract; the rule was prose
// and the test worked against it.
//
// "Internal" now means: NOT on this list. Runtime code reaches those symbols through the packages
// below (`@chatic/session`, `@chatic/auth`) or by concrete module path (`../session/hooks/app/...`).
// No second barrel and no subpath export for apps: the one deep path those packages allow is for
// test mocks.

// --- session readers (session state the app reads) -------------------------------------------------------
// Through the engine (`./sessionReads`), never the stores: on the phone the session may live in another
// process. What they return carries no token.
export {
    getActiveServerContext,
    getActiveSessionUser,
    // The place the session is really on, which the selection can disagree with — see its comment.
    getCommittedSessionSiteId,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    // The uid the account has in a named cloud — see its comment.
    getUidInCloud,
} from './sessionReads';
export {
    // Whether a storage key is one of the session's own. The debug storage screen groups keys by it;
    // the session declares its keys, so nothing outside keeps a second copy of the list.
    isSessionKey,
} from '@chatic/session';
export type {
    ActiveServerView,
    CloudSessionView,
    IdentityView,
    RelaySessionView,
    SessionAuthView,
    SessionContextView,
    SessionUserView,
} from '@chatic/runtime-core';

// --- session commands (non-React) ------------------------------------------------------------------
// Through the engine (`./sessionCommands`), never the core packages: on the phone the session may live
// in another process. The hooks below wrap the same commands for React.
export type { LogoutOptions } from '@chatic/auth';
// An invite login as a screen holds it — a handle, never the token — which `switchCloud` enters with,
// `forgetInviteLogin` drops when the screen will not, and `INVITE_LOGIN_UNKNOWN` is the switch's refusal
// of a handle the runtime does not hold. A login's answer is `SessionAccountView`, the account without its token.
export type { InviteLogin, SessionAccountView } from '@chatic/auth';
export { INVITE_LOGIN_UNKNOWN } from '@chatic/auth';
export { forgetInviteLogin } from './sessionCommands';
// Only these two. The other use-cases reach apps through their hooks (`useLogin` ·
// `useLoginRelaySocial` · `useSwitchCloudSession`, and the host's session controller), and Decision 6's rule is
// "the barrel sells what apps import" — so the raw functions stay internal. OAuth exchange and the
// logout-callback registry have no hook because their callers are not React (an OAuth redirect
// page's effect, a log uploader's module init).
export { createCredentialsByProvider } from './sessionCommands';
export { registerSessionLogoutCallback } from '@chatic/auth';
// Invite login and lookup. The lookup changes no session, so it is not a command.
export { registerUserWithInviteCode } from './sessionCommands';
export { fetchInviteInfoWithCode } from '@chatic/auth';
// Empties the place selection without a switch — for a cloud whose last place the user just left,
// where there is nothing to switch to. Not a hook: the caller already decides when, in an effect.
export { clearSiteSelection } from './sessionCommands';
// The account-profile write; `getRelaySessionUser` above is its read. Kept public because the
// local cache does not answer this question — its physical key is `${type}:${cid}:${uid}:${id}` and
// the repositories read it under the live scope, so while a cloud is active the relay `user` row is
// out of their reach (apps/web/docs/feature/mypage/README.md). apps/web uses both.
export { patchRelaySessionUser } from './sessionCommands';
// The account's own profile on the relay, read and written whichever cloud is active.
export { fetchAccountProfile, updateAccountProfile } from './sessionCommands';

// --- React surface --------------------------------------------------------------------------------
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
    useUidInCloud,
} from './hooks/session';

// --- device pairing ---------------------------------------------------------------------------------
// The code screen's request flow, the paired-cloud list a guest browser entered clouds through, and the
// secondary-device check the screens gate their entries on.
export {
    useIsPairedSession,
    usePairedCloudCheck,
    usePairedCloudIds,
    usePairedCloudNames,
    usePairingAwareLogout,
    usePairingRequest,
} from './hooks/pairing';
export type { PairingAwareLogout, PairingRequestOptions } from './hooks/pairing';
export { isInOwnCloudSession, isPairedSession } from './sessionReads';
export { forgetRefusedPairedCloud } from './sessionCommands';
export { isRefusedForEndedPairing } from '@chatic/auth';
export { deviceDisplayName, pairingClientOf } from '@chatic/auth';
export { classifyPairingError } from '@chatic/auth';
export type { PairingApprovalError } from '@chatic/auth';
export type { PairingRequestState } from '@chatic/auth';

// --- session actions · profile (live in other folders but belong to the session group) -----------------------------------------
// The facade groups by what a CONSUMER is doing, not by which folder the file sits in. These three
// are session concepts whose implementations belong to other modules for good reasons — the two
// actions drive a socket, and the profile hook assembles from repositories — so the barrel is where
// that gap closes instead of making an app know the split.

// The phone login as one step — the code proved and this device signed in, the session token never
// handed to the screen — and the retry of a switch that failed after the code was spent. Consumed by
// the phone-verification flows of apps/web and desktop-web, which `cancelPhoneLogin` when they close. The
// three codes are what they throw with.
export { PHONE_LOGIN_NOTHING_PENDING, PHONE_LOGIN_NO_TOKEN, PHONE_LOGIN_SWITCH_FAILED } from '@chatic/auth';
export { cancelPhoneLogin, confirmPhoneLogin, retryPhoneLogin } from './sessionCommands';
export type { PhoneLoginResult } from '@chatic/auth';
// The app-facing relay LOGOUT — the socket half. It notifies the server's socket (`auth.logout`)
// before the local store teardown, which is why it and not the store's teardown primitive is the
// public name. The cloud half is reached through `useLogoutCloudSession`;
// admin's `useRelaySessionGuard` is the one non-React caller of this one.
export { logoutSession } from './sessionCommands';
// The session user's profile, assembled from the user repository + the live session context.
export { useRuntimeProfile } from './hooks/session/readers/useRuntimeProfile';
export type { SessionProfile } from './hooks/session/readers/useRuntimeProfile';
// What the app does when the SERVER has confirmed the session is over — the credential was
// re-minted and the request replayed once, and it was still refused. It lives in `@chatic/transport`'s
// `http/` because that is where the verdict is produced, but an app reaches for it as session policy:
// admin registers a banner instead of the default alert + logout redirect.
export { authFailureReaction } from '@chatic/transport';
export type { AuthFailureReactionFn, IAuthFailureReaction } from '@chatic/transport';
