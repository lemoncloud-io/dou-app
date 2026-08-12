import { logger } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import {
    issueCloudDelegationToken,
    issueCloudToken,
    login as loginRelayRequest,
    refreshAuthToken,
    refreshCloudToken,
    registerDevice,
    verifyNativeAppToken,
} from '../api';
import { calcSignature, clearRelayTransportOverrides, webTransport } from '../transport';
import { getCloudSessionSnapshot } from './contexts';
import { cloudCore, identityCore, LANGUAGE_KEY, relayCore, resetWebCoreInit, startWebCoreInit } from './core';
import {
    clearRelaySession,
    getSelectedSiteId,
    rebuildSessionIdentity,
    setSelectedCloudId,
    setSelectedSiteId,
    setSessionAuthenticated,
    setSessionIdentityState,
} from './contextStore';
import type { CloudSessionSnapshot } from './types';
import { notifySessionStateChanged } from './utils';

export interface LogoutOptions {
    preserveUrl?: boolean;
}

export interface RefreshRelaySessionOptions {
    target?: string;
    syncProfile?: boolean;
}

const logoutCallbacks = new Set<() => void>();
const DEVICE_ID_STORAGE_KEY = 'chatic-device-id';

/**
 * Serializes refresh calls so concurrent refresh entry points (login-flow hydration, site-switch
 * refresh) never race. The old periodic refresh loop is gone — the SDK AuthController owns
 * recurring refresh — but user flows can still overlap.
 *
 * - In-flight calls with the same key coalesce onto the same promise.
 * - Different keys run serially (the later call — the site-switch target — is applied last).
 *
 * relay and cloud each use an independent instance (session-scenarios.md scenarios 2, 9).
 */
const createSerializedSingleFlight = <T>() => {
    let current: { key: string; promise: Promise<T> } | null = null;
    return (key: string, run: () => Promise<T>): Promise<T> => {
        if (current && current.key === key) {
            return current.promise;
        }
        const prior = current?.promise;
        const promise = prior ? prior.catch(() => undefined).then(() => run()) : run();
        const entry = { key, promise };
        current = entry;
        const clear = () => {
            if (current === entry) current = null;
        };
        promise.then(clear, clear);
        return promise;
    };
};

const parseTargetSiteId = (target?: string): string | null => {
    if (!target) return null;
    const separatorIndex = target.indexOf('@');
    if (separatorIndex < 0 || separatorIndex === target.length - 1) {
        return null;
    }
    return target.slice(separatorIndex + 1);
};

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    return {
        cloudId,
        siteId,
        identityToken: cloudCore.getIdentityToken(),
        backend: cloudCore.getBackend(),
        wss: cloudCore.getWss(),
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
        relayCore.saveRelayToken(tokenView);
    }

    setSessionAuthenticated(true);
    return tokenView;
};

/**
 * Bootstraps relay transport and resolves the initial relay authentication state.
 */
export const initializeRelaySession = async (): Promise<void> => {
    setSessionIdentityState({
        isInitialized: false,
        error: null,
    });

    logger.info('WEB_CORE', '[initialize] awaiting relay transport init');
    await startWebCoreInit();
    logger.info('WEB_CORE', '[initialize] relay transport init done, setting language + auth in parallel');
    const [, isAuthenticated] = await Promise.all([
        webTransport.setUseXLemonLanguage(true, LANGUAGE_KEY),
        webTransport.isAuthenticated(),
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
    identityCore.setDeviceId(deviceId);
    return deviceId;
};

/**
 * Creates a guest relay session from a device identifier and stores the resulting relay identity.
 */
export const loginRelayGuestByDevice = async (deviceId: string): Promise<UserTokenView> => {
    persistDeviceId(deviceId);
    const tokenView = await registerDevice(deviceId);

    // A fresh guest session delegates as its own uid for invite acceptance. Set delegatorId ONCE
    // here: it must persist across relay refreshes / cloud switches / cloud logout, and is only
    // replaced by the next guest login (a relay logout clears it via clearRelaySession).
    const { Token: _token, ...view } = tokenView as UserTokenView & Record<string, unknown>;
    const uid = (view as { uid?: string; id?: string }).uid ?? (view as { id?: string }).id;
    if (uid) {
        identityCore.setDelegatorId(uid);
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
    body: Parameters<typeof loginRelayRequest>[0];
    email?: boolean;
}): Promise<UserTokenView> => {
    return await applyRelaySession(await loginRelayRequest(body, email));
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
    const tokenView = await verifyNativeAppToken(body);
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

const relayRefreshFlight = createSerializedSingleFlight<void>();

/**
 * Refreshes the relay OAuth session and optionally switches the active relay site via `uid@sid`.
 *
 * Serialized with a service-level single-flight so concurrent callers (login hydration, relay site
 * switch) never race. NOT a recurring engine: the SDK AuthController owns periodic socket refresh,
 * and its writeback keeps the HTTP credentials fresh (2026-08 session audit §1).
 */
export const refreshRelaySession = (options: RefreshRelaySessionOptions = {}): Promise<void> =>
    relayRefreshFlight(options.target ?? '', () => runRefreshRelaySession(options));

// TODO(optimistic): for a relay site switch (target = uid@sid), pre-apply the sid before the refresh
// so cached data shows immediately, and roll the sid back if refreshAuthToken fails.
const runRefreshRelaySession = async ({
    target,
    syncProfile = true,
}: RefreshRelaySessionOptions = {}): Promise<void> => {
    // The refresh response is a full relay token view carrying the identity fields, so the session is
    // re-applied from it (via applyRelaySession) — no separate `/users/0/profile` GET.
    const refreshed = await refreshAuthToken(target);

    const selectedSiteId = parseTargetSiteId(target);
    if (selectedSiteId) {
        setSelectedSiteId(selectedSiteId);
    }

    if (!syncProfile) {
        // Relay site switch: the target's identity is unchanged, so keep the delegator id. Still
        // persist the site-scoped token (it carries the new site's identityToken that activeServer /
        // socket auth read) and refresh credentials + auth flag — the token is the source of truth.
        if (refreshed.Token) {
            await webTransport.buildCredentialsByToken(refreshed.Token);
            relayCore.saveRelayToken(refreshed);
        }
        setSessionAuthenticated(true);
        return;
    }

    await applyRelaySession(refreshed);
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
    cloudCore.clearSession();
    relayCore.clearSelectedSite();
    clearRelayTransportOverrides();
    resetWebCoreInit();
    localStorage.removeItem('chatic-device-token');

    // Cloud tokens were dropped by cloudCore.clearSession() above; clearRelaySession drops the relay
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
    cloudCore.clearSession();
    rebuildSessionIdentity();
    notifySessionStateChanged();
};

/**
 * Selects the relay-default cloud placeholder when no active cloud session should be attached.
 */
export const selectDefaultCloudSession = (): void => {
    setSelectedCloudId('default');
    setSelectedSiteId(null);
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
 * in switchSiteSession). Tokens are persisted only on success, so a failed exchange rolls
 * cid/sid back to the previous cloud and the previous cloud's tokens stay valid.
 */
export const switchCloudSession = async ({ cloudId }: { cloudId: string }): Promise<CloudSessionSnapshot> => {
    const previousCloudId = cloudCore.getSelectedCloudId();
    const previousSiteId = cloudCore.getSelectedSiteId();
    const isCloudChange = previousCloudId !== cloudId;

    // Optimistic cid pre-apply: flip the selected cloud (and drop the previous site) before
    // the token exchange. activeServer keeps the old socket until the new tokens commit, but
    // cid-derived observers swap to the target cloud's cache right away.
    if (isCloudChange) {
        cloudCore.saveSelectedCloudId(cloudId);
        cloudCore.clearSelectedSite();
    }

    try {
        // Reuse a recently-issued token for this cloud when still valid → skip both HTTP token
        // exchanges, so the cloud identity (uid) commits instantly and the cid+uid-scoped local cache
        // reads immediately on a re-switch (multi-socket-design.md perf: cloud-switch cache warmth).
        const cached = cloudCore.getCachedCloudTokens(cloudId);
        let cloudDelegationToken: CloudDelegationTokenView;
        let userToken: UserTokenView;
        if (cached) {
            cloudDelegationToken = cached.delegationToken;
            userToken = cached.cloudToken;
        } else {
            cloudDelegationToken = await issueCloudDelegationToken(cloudId);
            userToken = await issueCloudToken(cloudDelegationToken.backend as string, {
                delegationToken: cloudDelegationToken.delegationToken,
            });
            cloudCore.setCachedCloudTokens(cloudId, { delegationToken: cloudDelegationToken, cloudToken: userToken });
        }

        cloudCore.saveDelegationToken(cloudDelegationToken);
        const existingToken = isCloudChange ? null : cloudCore.getCloudToken();
        cloudCore.saveCloudToken(existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken);
        cloudCore.saveSelectedCloudId(cloudId);

        if (isCloudChange) {
            cloudCore.clearPlaceOrder(cloudId);
        }

        // Cloud token is saved above; rebuild identity so uid re-derives from the now-active cloud.
        rebuildSessionIdentity();
        setSelectedCloudId(cloudId);

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudCore.getSelectedSiteId());
    } catch (error) {
        // Roll the optimistic cid/sid back. Tokens were never overwritten on failure, so the
        // previous cloud session is still intact and usable.
        if (isCloudChange) {
            cloudCore.saveSelectedCloudId(previousCloudId ?? 'default');
            if (previousSiteId) {
                cloudCore.saveSelectedSiteId(previousSiteId);
            } else {
                cloudCore.clearSelectedSite();
            }
        }
        logger.error('SESSION', '[service] switchCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

const cloudRefreshFlight = createSerializedSingleFlight<CloudSessionSnapshot>();

/**
 * Refreshes the active cloud token (cloudToken-based), optionally switching site via `uid@sid`.
 *
 * Serialized with a service-level single-flight so concurrent callers (site switches, failure
 * recovery) never race. Recurring cloud refresh is owned by the cloud socket's SDK AuthController.
 */
export const refreshCloudSession = ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> =>
    cloudRefreshFlight(siteId, () => runRefreshCloudSession({ siteId }));

/**
 * Optimistically applies (or rolls back) the selected site for the app-runtime socket-driven site
 * switch (SDK `auth.switch`, multi-socket-design.md §8-2). Moves only the selected-site read model so
 * cid/sid-scoped caches swap immediately; app-runtime reuses it to roll the sid back if the socket
 * switch fails. `setSelectedSiteId` routes to relay/cloud store by active cloud; notify re-renders
 * `activeServer.siteId` observers.
 *
 * Distinct from `switchSiteSession` below (the legacy HTTP-refresh switch still used by
 * admin/desktop-web); apps/web drives the switch through app-runtime and only uses this primitive.
 */
export const applySelectedSite = (siteId: string | null): void => {
    setSelectedSiteId(siteId);
    notifySessionStateChanged();
};

/**
 * User-initiated site switch.
 *
 * Pre-applies the target sid (optimistic) and notifies so `activeServer.siteId` flips
 * immediately — cached channel streams swap to the new site without waiting for the
 * network. Commits via `refreshCloudSession`; on failure rolls the sid back to the
 * previous site. The committed cloud token only changes after a successful refresh
 * (see runRefreshCloudSession), so a failed switch leaves the real session intact and
 * only the optimistic sid needs reverting.
 */
export const switchSiteSession = async (siteId: string): Promise<void> => {
    const prevSiteId = getSelectedSiteId();
    if (siteId === prevSiteId) return;

    setSelectedSiteId(siteId);
    notifySessionStateChanged();

    try {
        await commitSiteSwitch(siteId);
    } catch (error) {
        setSelectedSiteId(prevSiteId);
        notifySessionStateChanged();
        throw error;
    }
};

/**
 * Commits a site switch against whichever server is active.
 *
 * A cloud-active session re-scopes the cloud token (`uid@sid`); a relay-only session
 * re-scopes the relay OAuth token instead. Routing a relay switch through the cloud
 * path throws "No cloud token uid for site auth" because there is no cloud token — the
 * active server determines which refresh applies.
 */
const commitSiteSwitch = async (siteId: string): Promise<void> => {
    const isCloudActive = cloudCore.getSelectedCloudId() !== 'default' && !!cloudCore.getCloudToken();
    if (isCloudActive) {
        await refreshCloudSession({ siteId });
        return;
    }

    // Relay site switch: re-issue the relay token scoped to the target site. The relay token uid
    // pairs with the site to form the `uid@sid` target. syncProfile is off — the relay identity
    // does not change across sites, so skip the extra profile fetch.
    const relayToken = relayCore.getRelayToken() as { uid?: string; id?: string } | null;
    const uid = relayToken?.uid ?? relayToken?.id;
    if (!uid) {
        throw new Error('No relay token uid for site auth');
    }
    await refreshRelaySession({ target: `${uid}@${siteId}`, syncProfile: false });
};

const performCloudRefresh = async ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> => {
    const cloudToken = cloudCore.getCloudToken();
    const uid = cloudToken?.id;
    if (!uid) {
        throw new Error('No cloud token uid for site auth');
    }
    const backend = cloudCore.getBackend();
    if (!backend || !cloudToken) {
        throw new Error('No active cloud backend for refresh');
    }

    const refreshed = await refreshCloudToken({
        baseURL: backend,
        token: cloudToken,
        target: `${uid}@${siteId}`,
    });
    const merged = { ...cloudToken, ...refreshed } as UserTokenView;
    cloudCore.saveCloudToken(merged);
    cloudCore.saveSelectedSiteId(siteId);
    setSelectedSiteId(siteId);

    // Cloud token refreshed; rebuild identity so uid re-derives from the updated cloud token.
    rebuildSessionIdentity();

    return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudCore.getSelectedCloudId() ?? 'default', siteId);
};

const runRefreshCloudSession = async ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> => {
    try {
        return await performCloudRefresh({ siteId });
    } catch (error) {
        // The cloud refresh POST is signed with the persisted cloud credential + identity JWT.
        // After a long sleep both are expired, so it 400s and — with no recovery — the socket can
        // never re-verify (previously only a manual reload fixed it). Reproduce what the reload does,
        // without reloading: re-mint the relay web-core creds, then re-exchange a fresh cloud token
        // (relay-signed, so it succeeds even when the cloud credential itself is dead), and retry
        // once. This is failure-only, so the happy path (site switches) pays nothing.
        const cloudId = cloudCore.getSelectedCloudId();
        if (!cloudId || cloudId === 'default') throw error;
        logger.warn('SESSION', '[service] cloud refresh failed — re-bootstrapping creds, retrying once', {
            error,
            data: { cloudId, siteId },
        });
        resetWebCoreInit();
        await startWebCoreInit();
        await switchCloudSession({ cloudId });
        return await performCloudRefresh({ siteId });
    }
};

/**
 * Conditional cloud refresh (cloudToken-based) — refreshes only when a cloud is connected and a
 * site session exists.
 *
 * - Skips when the selected cloud is `default` or there is no delegation token (cloud not connected).
 * - Skips when there is no selected site (sid null), since no site session exists (cid/sid default rule).
 *
 * DEAD EXPORT as of the 2026-08 session audit (§5-9): the periodic loop that drove it
 * (useTokenRefresh) was removed when the SDK AuthController took over recurring refresh, and no
 * runtime caller remains (tests only). Slated for deletion in audit §7 Phase 3 — do not add new
 * callers; recurring refresh belongs to the SDK.
 */
export const refreshActiveCloudSession = async (): Promise<void> => {
    if (cloudCore.getSelectedCloudId() === 'default' || !cloudCore.getDelegationToken()) {
        return;
    }
    const siteId = cloudCore.getSelectedSiteId();
    if (!siteId) {
        return;
    }
    await refreshCloudSession({ siteId });
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
        const token = cloudCore.getIdentityToken();
        const authId = cloudCore.getCloudToken()?.Token?.authId ?? null;
        return token && authId ? { token, authId } : null;
    }

    // relay: identity token from the relay store, authId from the cached lemon signature.
    const token = relayCore.getIdentityToken();
    const authId = relayCore.getRelayToken()?.$auth?.id || null;

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
        const cloudToken = cloudCore.getCloudToken()?.Token;
        const authId = cloudToken?.authId;
        const accountId = cloudToken?.accountId;
        const identityId = cloudToken?.identityId;
        if (!authId || !accountId || !identityId) {
            throw new Error('Missing cloud token fields for socket auth signature');
        }
        const current = new Date().toISOString();
        const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);
        return { signature, current };
    }

    // relay: compute the signature over `$auth.id` ourselves instead of reusing
    // webTransport.getTokenSignature(), which keys on `Token.authId` for the HTTP refresh path.
    const relayToken = relayCore.getRelayToken();
    const authId = relayToken?.$auth?.id;
    const accountId = relayToken?.Token?.accountId;
    const identityId = relayToken?.Token?.identityId;
    if (!authId || !accountId || !identityId) {
        throw new Error('Missing relay token fields for socket auth signature');
    }
    const current = new Date().toISOString();
    const signature = calcSignature({ authId, accountId, identityId, identityToken: '' }, current);
    return { signature, current };
};

/**
 * Writes an SDK-refreshed token back into the web-core store for a specific server kind — the
 * per-socket writeback routing that unblocks dual sockets (multi-socket-design.md §6-6): a relay
 * refresh arriving while cloud is active must land in the relay store, not the active one.
 *
 * Asymmetric by design (signing.md §3): relay must also rebuild the lemon-web-core AWS credential
 * cache — relay signed HTTP signs from that cache, not from relayCore — while cloud only persists
 * the merged token because cloud HTTP reads cloudCore live per request.
 */
export const commitServerRefreshedToken = async (kind: ServerKind, view: UserTokenView): Promise<void> => {
    if (kind === 'cloud') {
        const existing = cloudCore.getCloudToken();
        cloudCore.saveCloudToken(existing ? ({ ...existing, ...view } as UserTokenView) : view);
    } else if (view.Token) {
        // A socket refresh view can omit `Token.identityToken` (the SDK itself falls back to the token
        // it already holds), but relay REQUIRES it — relay signed HTTP sends it as `x-lemon-identity`
        // and the next register reads it back via getIdentityToken(). Preserve the stored identityToken
        // when the fresh view lacks one, mirroring the HTTP refresh path (api/auth.ts `refreshAuthToken`).
        const previous = relayCore.getRelayToken();
        const merged = {
            ...view,
            Token: {
                ...view.Token,
                identityToken: view.Token.identityToken ?? previous?.Token?.identityToken,
            },
        } as UserTokenView;
        await webTransport.buildCredentialsByToken(merged.Token);
        relayCore.saveRelayToken(merged);
    }

    // Re-derive uid / identity from the freshly written token so activeServer + UI stay in sync.
    rebuildSessionIdentity();
};
