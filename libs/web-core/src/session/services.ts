import { logger } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import {
    issueCloudDelegationToken,
    issueCloudToken,
    login as loginRelayRequest,
    logout as logoutRelayRequest,
    refreshAuthToken,
    refreshCloudToken,
    registerDevice,
    verifyNativeAppToken,
} from '../api';
import { clearRelayTransportOverrides, webTransport } from '../transport';
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
 * Serializes refresh calls so the periodic refresh loop and site-switch refresh never race.
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
 * gone — profile facts are tracked from the token + user cache by app-runtime's useSessionProfile.
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

const relayRefreshFlight = createSerializedSingleFlight<void>();

/**
 * Refreshes the relay OAuth session and optionally switches the active relay site via `uid@sid`.
 *
 * Serialized with a service-level single-flight so the periodic refresh loop and site switch never race.
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

    await logoutRelayRequest().catch(error => {
        logger.error('AUTH', '[service] relay logout request failed', { error });
    });

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

    let targetUrl = '/auth/login?logout=1';
    if (options?.preserveUrl) {
        const params = new URLSearchParams(searchBeforeCleanup);
        const loginUrl = new URL('/auth/login', window.location.origin);
        for (const key of ['code', 'provider', '_backend', '_wss']) {
            const value = params.get(key);
            if (value) loginUrl.searchParams.set(key, value);
        }
        loginUrl.searchParams.set('logout', '1');
        targetUrl = loginUrl.toString();
    }

    const stepsBack = window.history.length - 1;
    if (stepsBack > 0) {
        window.addEventListener(
            'popstate',
            () => {
                window.location.replace(targetUrl);
            },
            { once: true }
        );
        window.history.go(-stepsBack);
    } else {
        window.location.replace(targetUrl);
    }
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
        const cloudDelegationToken = await issueCloudDelegationToken(cloudId);
        const userToken = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

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
 * Serialized with a service-level single-flight so the periodic refresh loop and site switch never race.
 */
export const refreshCloudSession = ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> =>
    cloudRefreshFlight(siteId, () => runRefreshCloudSession({ siteId }));

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

const runRefreshCloudSession = async ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> => {
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

/**
 * Cloud refresh for the periodic loop. Refreshes the cloudToken only when a cloud is connected
 * and a site session exists.
 *
 * - Skips when the selected cloud is `default` or there is no delegation token (cloud not connected).
 * - Skips when there is no selected site (sid null), since no site session exists (cid/sid default rule).
 *
 * Failures are absorbed by the caller (useTokenRefresh); they never trigger logout, to keep relay continuity.
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
