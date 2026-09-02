import { logger } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { getRepositories } from '../../data/runtime';
import { LemonHmacSigner } from '@chatic/auth-sign';
import { clearRelayTransportOverrides, LANGUAGE_KEY } from '@chatic/web-config';
import {
    hasStoredRelaySession,
    resetWebTransportInit,
    startWebTransportInit,
    webTransport,
} from '../../http/transport';
import { cloudStore, identityStore, relayStore } from '../store/stores';
import {
    clearRelaySession,
    getCloudSessionSnapshot,
    notifySessionStateChanged,
    rebuildSessionIdentity,
    setSelectedCloudId,
    setSelectedSiteId,
    setSessionAuthenticated,
    setSessionIdentityState,
} from '../store';
import type { CloudSessionSnapshot } from '../store';
import type { IAuthRepositoryV2 } from '@chatic/data';
import { issueCloudTokens } from './cloudTokens';

/**
 * Every HTTP call this file makes goes through `data`, not through a gateway.
 *
 * `session/auth` used to hold the `OAuthHttpGateway` itself — the last place outside `data` that
 * talked to a gateway directly. It now reaches the same actions through `AuthRepositoryV2`, so there
 * is exactly one path from this runtime to an HTTP gateway and it runs through the data layer
 * (ADR-0036 gateway 예외 폐지 · ADR-0070 결정 5).
 *
 * What did NOT change is who owns session material. The repository performs these calls and never
 * interprets what comes back — the same rule `confirmPhoneCode` already followed on the socket lane.
 * Installing a token stays this file's job alone.
 *
 * `getRepositories()` (not the `useRuntimeRepositories` hook) because this file is not React — same
 * accessor `socket/sync/plans.ts` uses. Called per action, so import order never matters.
 *
 * **Endpoint note.** `web-core/api/users.ts` pinned `delegate-cloud` / `verify-native-token` to the
 * STATIC build-time host (`getCoreEndpoint()` → `VITE_DOU_ENDPOINT`), while every other relay call —
 * and the socket — honored the dynamic resolver (`?_backend=` deeplink override → `window.DOU_ENDPOINT`
 * → env). The gateways use the dynamic resolver throughout, so those two actions follow the override
 * like everything else. Identical in normal operation (both read the same env value); the difference
 * only shows in a deeplinked dev/QA session, where honoring the override is the point.
 */
const authRepository = (): IAuthRepositoryV2 => getRepositories().auth;

// `calcSignature`'s web-core shim was a wrapper over `@chatic/auth-sign`; call the lib directly here.
const authSigner = new LemonHmacSigner();
const calcSignature = (
    payload: { authId: string; accountId: string; identityId: string; identityToken: string },
    current: string,
    userAgent: string
): string => authSigner.sign(payload, { current, userAgent }).signature;

export interface LogoutOptions {
    preserveUrl?: boolean;
}

const logoutCallbacks = new Set<() => void>();
const DEVICE_ID_STORAGE_KEY = 'chatic-device-id';

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    return {
        cloudId,
        siteId,
        identityToken: cloudStore.getIdentityToken(),
        backend: cloudStore.getBackend(),
        wss: cloudStore.getWss(),
    };
};

/**
 * Applies a relay token view as the active session: builds AWS credentials, persists the token (the
 * auth anchor + uid/profile-seed source), and marks the session authenticated. Profile shaping is
 * gone — profile facts are tracked from the token + user cache by app-runtime's useRuntimeProfile.
 *
 * Note: this deliberately does NOT touch delegatorId. delegatorId is set once at guest login and
 * must survive every relay refresh / cloud switch that also runs through here, so it is owned by
 * loginRelayGuestByDevice (set) and clearRelaySession (cleared on relay logout) only.
 */
const applyRelaySession = async (tokenView: UserTokenView): Promise<UserTokenView> => {
    if (tokenView.Token) {
        await webTransport.buildCredentialsByToken(tokenView.Token);
        relayStore.saveRelayToken(tokenView);
    }

    setSessionAuthenticated(true);
    return tokenView;
};

/**
 * Bootstraps relay transport and resolves the initial relay authentication state.
 *
 * The auth flag is a READ-ONLY session-existence probe (hasStoredRelaySession), not the old
 * `webTransport.isAuthenticated()` — that call fired lemon-web-core's own HTTP refresh on a stale
 * boot, a second refresh engine that updated only the lemon store and left relayStore/the socket
 * SDK's signing material stale (audit §1 "토큰 사본 3벌"). Boot now never refreshes: stale
 * credentials are rebuilt by the socket AuthController's refresh writeback once the socket
 * re-verifies (or by an explicit requestRelaySessionRefresh). A returning user with expired credentials
 * therefore boots into the logged-in UI instead of being treated as logged out — including on an
 * offline boot, where the old refresh probe always failed.
 */
export const initializeRelaySession = async (): Promise<void> => {
    setSessionIdentityState({
        isInitialized: false,
        error: null,
    });

    logger.debug('WEB_CORE', '[initialize] awaiting relay transport init');
    await startWebTransportInit();
    logger.debug('WEB_CORE', '[initialize] relay transport init done, setting language + probing session');
    const [, isAuthenticated] = await Promise.all([
        webTransport.setUseXLemonLanguage(true, LANGUAGE_KEY),
        hasStoredRelaySession(),
    ]);

    setSessionIdentityState({
        isInitialized: true,
        isAuthenticated,
    });
};

/**
 * Persists the current device identifier for later relay login and restore flows.
 */
export const persistDeviceId = (deviceId: string): string => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    identityStore.setDeviceId(deviceId);
    return deviceId;
};

/**
 * Creates a guest relay session from a device identifier and stores the resulting relay identity.
 */
export const loginRelayGuestByDevice = async (deviceId: string): Promise<UserTokenView> => {
    persistDeviceId(deviceId);
    const tokenView = await authRepository().registerDevice(deviceId);

    // A fresh guest session delegates as its own uid for invite acceptance. Set delegatorId ONCE
    // here: it must persist across relay refreshes / cloud switches / cloud logout, and is only
    // replaced by the next guest login (a relay logout clears it via clearRelaySession).
    const { Token: _token, ...view } = tokenView as UserTokenView & Record<string, unknown>;
    const uid = (view as { uid?: string; id?: string }).uid ?? (view as { id?: string }).id;
    if (uid) {
        identityStore.setDelegatorId(uid);
    }

    return await applyRelaySession(tokenView);
};

/**
 * Logs into relay with a user credential payload and stores the resulting relay identity.
 */
export const loginRelayUser = async ({
    body,
    email,
}: {
    body: Parameters<IAuthRepositoryV2['login']>[0];
    email?: boolean;
}): Promise<UserTokenView> => {
    return await applyRelaySession(await authRepository().login(body, email));
};

/**
 * Exchanges an OAuth authorization code for a relay session.
 *
 * Same shape as every other login here: the login endpoint answers with a full relay token view and
 * `applyRelaySession` commits it. It used to be the odd one out — it kept only `Token`, threw the rest
 * away, and left the caller to recover the discarded fields by calling the REFRESH endpoint a moment
 * later. That was the last HTTP refresh in the codebase (ADR-0070 불변조건 1·2).
 */
export const createCredentialsByProvider = async (provider = 'google', code: string): Promise<UserTokenView> => {
    const tokenView = await authRepository().exchangeCode({ provider, code });

    // The relay socket registers with `$auth.id` (signServerAuth) and it is not obtainable from the
    // profile endpoint — if a login response ever stops carrying it the failure surfaces later as a
    // socket auth error, so say it here where the cause is still visible.
    if (!(tokenView as UserTokenView & { $auth?: { id?: string } }).$auth?.id) {
        logger.warn('AUTH', '[service] OAuth exchange returned no $auth.id — relay socket cannot register', {
            data: { provider },
        });
    }

    return await applyRelaySession(tokenView);
};

/**
 * Promotes the active relay session with a verified native social token.
 */
export const loginRelaySocial = async ({
    body,
}: {
    body: VerifyNativeTokenBody;
    // `provider` is still accepted for caller compatibility but no longer stored — the OAuth provider
    // is no longer session state (native OAuth logout is an app/bridge concern; see logoutRelaySession).
    provider?: OAuthLoginProvider | null;
}): Promise<UserTokenView> => {
    const tokenView = await authRepository().verifyNativeToken(body);
    return await applyRelaySession(tokenView);
};

/**
 * Applies an ALREADY-ISSUED relay token view as the active session — the socket-login case
 * (`auth.verify-hash-alias` step=check returns `$token` over the websocket, so there is no HTTP
 * login call to run here). Same commit as the other login paths (applyRelaySession): rebuild AWS
 * credentials, persist the token, mark authenticated. Like the social promotion, it does NOT touch
 * delegatorId — that stays owned by loginRelayGuestByDevice / clearRelaySession.
 *
 * Refreshing the live SOCKET identity is not done here; app-runtime's applySessionToken owns that
 * (web-core has no socket access) and calls this first so the store leads and the socket follows.
 */
export const loginRelayByToken = async (tokenView: UserTokenView): Promise<UserTokenView> => {
    return await applyRelaySession(tokenView);
};

/**
 * Tears down the relay session and clears dependent cloud state while preserving deeplink logout redirects when needed.
 */
export const logoutRelaySession = async (options?: LogoutOptions): Promise<void> => {
    const searchBeforeCleanup = window.location.search;

    // No server-side logout: there is no backend session-revoke endpoint (the old POST /users/logout
    // always 403'd because it was unsigned, and it was never authoritative). Logout is purely a LOCAL
    // teardown — clear the relay/cloud tokens + credentials + selection below. The socket auth session
    // is ended separately by the caller's best-effort socket `auth.logout` (app-runtime logoutSession).

    logoutCallbacks.forEach(callback => {
        try {
            callback();
        } catch (error) {
            logger.error('AUTH', 'Logout callback error', { error });
        }
    });
    logoutCallbacks.clear();

    // Native OAuth logout is no longer handled here: the OAuth provider is no longer session state.
    // A native shell that needs to sign out of the provider SDK should register that via
    // registerSessionLogoutCallback (it owns the provider it logged in with).
    await webTransport.logout();
    cloudStore.clearSession();
    relayStore.clearSelectedSite();
    clearRelayTransportOverrides();
    resetWebTransportInit();
    localStorage.removeItem('chatic-device-token');

    // Cloud tokens were dropped by cloudStore.clearSession() above; clearRelaySession drops the relay
    // token and rebuilds identity as unauthenticated (uid → null).
    clearRelaySession();
    notifySessionStateChanged();

    // Land on home directly. `/auth/login` is only a shim that forwards to `/` (see apps/web
    // LoginPage), so routing through it just added a redirect hop. We also do NOT rewind the
    // history stack: back-navigating into an authenticated URL is already handled by the router,
    // which falls unauthenticated paths back to `/` (see apps/web PublicRoutes).
    //
    // `logout=1` must survive onto the target: webTransport reads it from the freshly loaded
    // document's query string to wipe the persisted `@`-prefixed storage keys.
    const targetUrl = new URL('/', window.location.origin);
    if (options?.preserveUrl) {
        const params = new URLSearchParams(searchBeforeCleanup);
        for (const key of ['code', 'provider', '_backend', '_wss']) {
            const value = params.get(key);
            if (value) targetUrl.searchParams.set(key, value);
        }
    }
    targetUrl.searchParams.set('logout', '1');

    window.location.replace(targetUrl.toString());
};

/**
 * Clears the active cloud session while keeping relay authentication intact.
 */
export const logoutCloudSession = (): void => {
    // Fully leave the cloud: clear the delegation + cloud token AND the selected cloud/site so
    // `cloud.isActive` flips to false and uid / activeServer fall back to relay ("return to default
    // cloud, keep relay"). Clearing only the delegation token left cloud.isActive true — the session
    // stayed pinned to the cloud (stale uid/activeServer). Re-entry re-issues fresh tokens anyway.
    cloudStore.clearSession();
    rebuildSessionIdentity();
    notifySessionStateChanged();
};

/**
 * Registers a callback that is invoked once during relay logout.
 */
export const registerSessionLogoutCallback = (callback: () => void): (() => void) => {
    logoutCallbacks.add(callback);
    return () => logoutCallbacks.delete(callback);
};

/**
 * Switches the active cloud session by exchanging a delegation token for a cloud token.
 *
 * The cid is pre-applied optimistically before the exchange so app-runtime's cid-scoped
 * cache observers re-subscribe to the target cloud immediately (mirrors the optimistic sid
 * in `applySelectedSite`). Tokens are persisted only on success, so a failed exchange rolls
 * cid/sid back to the previous cloud and the previous cloud's tokens stay valid.
 */
export const switchCloudSession = async ({ cloudId }: { cloudId: string }): Promise<CloudSessionSnapshot> => {
    const previousCloudId = cloudStore.getSelectedCloudId();
    const previousSiteId = cloudStore.getSelectedSiteId();
    const isCloudChange = previousCloudId !== cloudId;

    // Optimistic cid pre-apply: flip the selected cloud (and drop the previous site) before
    // the token exchange. activeServer keeps the old socket until the new tokens commit, but
    // cid-derived observers swap to the target cloud's cache right away.
    if (isCloudChange) {
        cloudStore.saveSelectedCloudId(cloudId);
        cloudStore.clearSelectedSite();
    }

    try {
        // Reuse a recently-issued token for this cloud when still valid → skip both HTTP token
        // exchanges, so the cloud identity (uid) commits instantly and the cid+uid-scoped local cache
        // reads immediately on a re-switch (multi-socket-design.md perf: cloud-switch cache warmth).
        // The exchange itself lives in `./cloudTokens`, shared with the renewal path that re-issues
        // the cloud we are already in (which passes allowCache: false — see that module).
        const { delegationToken: cloudDelegationToken, cloudToken: userToken } = await issueCloudTokens(cloudId, {
            allowCache: true,
        });

        cloudStore.saveDelegationToken(cloudDelegationToken);
        const existingToken = isCloudChange ? null : cloudStore.getCloudToken();
        cloudStore.saveCloudToken(existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken);
        cloudStore.saveSelectedCloudId(cloudId);

        if (isCloudChange) {
            cloudStore.clearPlaceOrder(cloudId);
        }

        // Cloud token is saved above; rebuild identity so uid re-derives from the now-active cloud.
        rebuildSessionIdentity();
        setSelectedCloudId(cloudId);

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudStore.getSelectedSiteId());
    } catch (error) {
        // Roll the optimistic cid/sid back. Tokens were never overwritten on failure, so the
        // previous cloud session is still intact and usable.
        if (isCloudChange) {
            cloudStore.saveSelectedCloudId(previousCloudId ?? 'default');
            if (previousSiteId) {
                cloudStore.saveSelectedSiteId(previousSiteId);
            } else {
                cloudStore.clearSelectedSite();
            }
        }
        logger.error('SESSION', '[service] switchCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

/**
 * Optimistically applies (or rolls back) the selected site for the app-runtime socket-driven site
 * switch (SDK `auth.switch`, multi-socket-design.md §8-2). Moves only the selected-site read model so
 * cid/sid-scoped caches swap immediately; app-runtime reuses it to roll the sid back if the socket
 * switch fails. `setSelectedSiteId` routes to relay/cloud store by active cloud; notify re-renders
 * `activeServer.siteId` observers.
 *
 * The HTTP counterpart (`switchSiteSession`, which committed a switch by re-issuing the token) is
 * gone — every app drives the switch through the socket, and this primitive is what the socket path
 * uses to move the read model.
 */
export const applySelectedSite = (siteId: string | null): void => {
    setSelectedSiteId(siteId);
    notifySessionStateChanged();
};

// ---------------------------------------------------------------------------
// SDK AuthController (ClientSocketAuth) bridge helpers — active-server-aware.
//
// These feed the app-runtime socket delegate: seed the SDK `register` call, back
// its stateless `sign` callback, and write SDK-refreshed tokens back into the
// web-core stores that the HTTP/AWS signing layers read. The active server
// (relay vs cloud) decides the token source, signature source, and target store.
//
// Contract + branching rationale live in libs/app-runtime/docs/socket/auth/signing.md.
// The lemon-hmac signature never depends on the token string (calcSignature signs
// an empty identityToken slot), so the SDK-injected token argument is ignored and
// the signature is recomputed from the active server's stored fields.
// ---------------------------------------------------------------------------

/** Which socket/server a bridge helper acts on. Dual-socket callers pass this explicitly. */
export type ServerKind = 'relay' | 'cloud';

/**
 * Seeds the SDK `register({ token, authId })` call for a specific server kind. Returns null when
 * either field is unavailable so the caller can defer register until a token exists.
 */
export const getServerAuthRegistration = async (
    kind: ServerKind
): Promise<{ token: string; authId: string } | null> => {
    if (kind === 'cloud') {
        const token = cloudStore.getIdentityToken();
        const authId = cloudStore.getCloudToken()?.Token?.authId ?? null;
        return token && authId ? { token, authId } : null;
    }

    // relay: identity token from the relay store, authId from the cached lemon signature.
    const token = relayStore.getIdentityToken();
    const authId = relayStore.getRelayToken()?.$auth?.id || null;

    return token && authId ? { token, authId } : null;
};

/**
 * Backs the SDK stateless `sign` callback with the lemon-hmac signature for a specific server kind.
 * `target` (a site-switch selector) is accepted for callback-shape parity but does not change the
 * signature — it is carried only in the SDK `auth.switch` packet (see signing.md §1).
 */
export const signServerAuth = async (
    kind: ServerKind,
    target?: string
): Promise<{ signature: string; current: string }> => {
    if (kind === 'cloud') {
        const cloudToken = cloudStore.getCloudToken()?.Token;
        const authId = cloudToken?.authId;
        const accountId = cloudToken?.accountId;
        const identityId = cloudToken?.identityId;
        if (!authId || !accountId || !identityId) {
            throw new Error('Missing cloud token fields for socket auth signature');
        }
        const current = new Date().toISOString();
        const signature = calcSignature(
            { authId, accountId, identityId, identityToken: '' },
            current,
            navigator.userAgent
        );
        return { signature, current };
    }

    // relay: compute the signature over `$auth.id` ourselves instead of reusing
    // webTransport.getTokenSignature(), which keys on `Token.authId` for the HTTP refresh path.
    const relayToken = relayStore.getRelayToken();
    const authId = relayToken?.$auth?.id;
    const accountId = relayToken?.Token?.accountId;
    const identityId = relayToken?.Token?.identityId;
    if (!authId || !accountId || !identityId) {
        throw new Error('Missing relay token fields for socket auth signature');
    }
    const current = new Date().toISOString();
    const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current, navigator.userAgent);
    return { signature, current };
};

/**
 * Writes an SDK-refreshed token back into the web-core store for a specific server kind — the
 * per-socket writeback routing that unblocks dual sockets (multi-socket-design.md §6-6): a relay
 * refresh arriving while cloud is active must land in the relay store, not the active one.
 *
 * Asymmetric by design (signing.md §3): relay must also rebuild the lemon-web-core AWS credential
 * cache, because relay signed HTTP signs from that cache and not from relayStore. Cloud only
 * persists the merged token — **it has no HTTP signing to keep alive.** Nothing signs with the cloud
 * credential: the one request that did was the cloud HTTP refresh, deleted by ADR-0070, and requests
 * bound for a cloud host are signed the relay way. What the cloud token still owes is the SOCKET
 * signature (`signServerAuth('cloud')`, a lemon HMAC over `authId`/`accountId`/`identityId`), and
 * that reads the store live per packet — which is why persisting is the whole job here.
 */
export const commitServerRefreshedToken = async (kind: ServerKind, view: UserTokenView): Promise<void> => {
    if (kind === 'cloud') {
        const existing = cloudStore.getCloudToken();
        const merged = existing ? ({ ...existing, ...view } as UserTokenView) : view;
        cloudStore.saveCloudToken(merged);
        // Keep the per-cloud cache level with the active token. That cache is the OTHER copy of this
        // token and it serves any re-switch back to this cloud within its own expiry margin, so
        // leaving it behind means a later re-entry can install the PRE-refresh credential and re-open
        // the 403 window this writeback just closed.
        const delegationToken = cloudStore.getDelegationToken();
        if (delegationToken?.cloudId) {
            cloudStore.setCachedCloudTokens(delegationToken.cloudId, { delegationToken, cloudToken: merged });
        }
    } else if (view.Token) {
        // A socket refresh view can omit `Token.identityToken` (the SDK itself falls back to the token
        // it already holds), but relay REQUIRES it — relay signed HTTP sends it as `x-lemon-identity`
        // and the next register reads it back via getIdentityToken(). Preserve the stored identityToken
        // when the fresh view lacks one, mirroring the HTTP refresh path (api/auth.ts `refreshAuthToken`).
        const previous = relayStore.getRelayToken();
        const merged = {
            // `...previous` first, mirroring the cloud branch above: a socket refresh view is not
            // guaranteed to be a full user view, and the relay token is now also the ACCOUNT profile
            // display source (getRelaySessionUser). Without the merge, a slim refresh silently drops
            // name/photo/email and the MY page header blanks out mid-session.
            ...previous,
            ...view,
            Token: {
                ...view.Token,
                identityToken: view.Token.identityToken ?? previous?.Token?.identityToken,
                // Same preservation as identityToken, for the same reason. A socket refresh view
                // routinely omits `identityPoolId`, and this merge feeds BOTH stores — it is written
                // to relayStore here and to lemon's own store by `buildCredentialsByToken` below
                // (which calls `saveOAuthToken` internally, overwriting the field with '').  So
                // without this line the pool id is lost from every copy after the first socket
                // refresh, and the relay HTTP refresh's `identityPoolId` inheritance silently
                // becomes a no-op. Pre-existing defect, surfaced while making the store the signing
                // source (ADR-0070 3단계 체크리스트 5).
                identityPoolId: view.Token.identityPoolId ?? previous?.Token?.identityPoolId,
                // Same preservation, for a reason the two above do not have: this copy is the only
                // record of WHICH credential is currently signing. When the view carries none, the
                // `else` branch below leaves lemon's cache on the PREVIOUS credential — dropping the
                // field here would make the store disagree with the signer, and `credentialFreshness`
                // (which reads this field to tell a signature rejection from a network outage) would
                // report "cannot measure" for exactly the window that warn calls out.
                credential: view.Token.credential ?? previous?.Token?.credential,
            },
        } as UserTokenView;
        // `credential` is OPTIONAL in the wire contract, and lemon's `buildCredentialsByToken`
        // throws `.AccessKeyId (string) is required!` when it is absent — which used to take the
        // store write below down with it, silently: the caller fires this writeback with `void`, so
        // the rejection surfaced as an unhandled promise and `requestRelaySessionRefresh` had already
        // resolved `true`. Rebuild the credential cache only when the view actually carries one,
        // and keep the store write either way (identityToken and the profile fields are still good).
        //
        // Read off `view`, NOT `merged`: merged inherits the previous credential (so the store copy
        // keeps naming whatever is actually signing), and asking merged here would rebuild lemon's
        // cache from the credential it already holds — a no-op that also silences the warn below,
        // which is the only signal that a refresh arrived without signing material.
        const issued = view.Token.credential;
        if (issued?.AccessKeyId && issued?.SecretKey) {
            await webTransport.buildCredentialsByToken(merged.Token);
        } else {
            // Signed HTTP keeps signing with the previous credential — which is exactly the state
            // that 403s once it lapses. Loud, because nothing downstream can detect this.
            logger.warn('AUTH', '[commitServerRefreshedToken] refresh view carried no AWS credential', {
                data: { kind, hasToken: !!merged.Token.identityToken },
            });
        }
        relayStore.saveRelayToken(merged);
    }

    // Re-derive uid / identity from the freshly written token so activeServer + UI stay in sync.
    rebuildSessionIdentity();
};
