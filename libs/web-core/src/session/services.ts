import { isNative, logger, webClient } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { UserProfile$, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import {
    fetchProfile,
    issueCloudDelegationToken,
    issueCloudToken,
    login as loginRelayRequest,
    loginWithInviteCode as loginWithInviteCodeRequest,
    logout as logoutRelayRequest,
    refreshAuthToken,
    refreshCloudToken,
    registerDevice,
    tryFetchProfile,
    updateProfile,
    verifyNativeAppToken,
} from '../api';
import { clearRelayTransportOverrides, webTransport } from '../transport';
import { getCloudSessionSnapshot } from './contexts';
import { cloudCore, identityCore, LANGUAGE_KEY, relayCore, resetWebCoreInit, startWebCoreInit } from './core';
import {
    clearSessionCloudProfile,
    clearSessionProfile,
    getSelectedSiteId,
    setSelectedCloudId,
    setSelectedSiteId,
    setSessionAuthenticated,
    setSessionCloudProfile,
    setSessionIdentityState,
    setSessionProfile,
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

/**
 * Builds a cloud-scoped profile view from token payload fields without mutating relay profile data.
 */
const toCloudProfile = (cloudUser: Partial<UserView>): UserProfile$ =>
    ({
        ...cloudUser,
        uid: (cloudUser as { uid?: string; id?: string }).uid ?? (cloudUser as { id?: string }).id,
        $user: cloudUser as UserView,
    }) as unknown as UserProfile$;

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    return {
        cloudId,
        siteId,
        identityToken: cloudCore.getIdentityToken(),
        backend: cloudCore.getBackend(),
        wss: cloudCore.getWss(),
    };
};

const applyRelayProfile = async (tokenView: UserTokenView): Promise<UserTokenView> => {
    if (tokenView.Token) {
        await webTransport.buildCredentialsByToken(tokenView.Token);
        relayCore.saveRelayToken(tokenView);
    }
    const { Token: _token, ...profile } = tokenView;

    // Detect and persist user role from the profile
    const userRole = (profile as any)?.$user?.userRole ?? (profile as any)?.userRole;
    if (userRole === 'guest') {
        identityCore.setIsGuest(true);
    } else if (userRole === 'user') {
        identityCore.setIsGuest(false);
    }

    setSessionProfile(profile as unknown as UserProfile$);
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
    identityCore.setIsInvited(false);
    identityCore.setOAuthProvider(null);
    return await applyRelayProfile(await registerDevice(deviceId));
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
    identityCore.setIsInvited(false);
    return await applyRelayProfile(await loginRelayRequest(body, email));
};

/**
 * Promotes the active relay session with a verified native social token.
 */
export const loginRelaySocial = async ({
    body,
    provider,
}: {
    body: VerifyNativeTokenBody;
    provider?: OAuthLoginProvider | null;
}): Promise<UserTokenView> => {
    const tokenView = await verifyNativeAppToken(body);
    identityCore.setIsInvited(false);
    if (provider !== undefined) {
        identityCore.setOAuthProvider(provider);
    }
    return await applyRelayProfile(tokenView);
};

/**
 * Logs into relay using an invite code and preserves the delegator identity required by the invite flow.
 */
export const loginWithInviteCode = async ({
    code,
    delegatorId,
    backend,
}: {
    code: string;
    delegatorId: string;
    backend?: string;
}): Promise<UserTokenView> => {
    const tokenView = await loginWithInviteCodeRequest(code, delegatorId, backend);
    identityCore.setIsInvited(true);
    identityCore.setOAuthProvider(null);
    identityCore.setDelegatorId(delegatorId);
    return await applyRelayProfile(tokenView);
};

const relayRefreshFlight = createSerializedSingleFlight<UserProfile$ | null>();

/**
 * Refreshes the relay OAuth session and optionally switches the active relay site via `uid@sid`.
 *
 * Serialized with a service-level single-flight so the periodic refresh loop and site switch never race.
 */
export const refreshRelaySession = (options: RefreshRelaySessionOptions = {}): Promise<UserProfile$ | null> =>
    relayRefreshFlight(options.target ?? '', () => runRefreshRelaySession(options));

// TODO(optimistic): for a relay site switch (target = uid@sid), pre-apply the sid before the refresh
// so cached data shows immediately, and roll the sid back if refreshAuthToken fails.
const runRefreshRelaySession = async ({
    target,
    syncProfile = true,
}: RefreshRelaySessionOptions = {}): Promise<UserProfile$ | null> => {
    const refreshedToken = await refreshAuthToken(target);
    await webTransport.buildCredentialsByToken(refreshedToken);
    setSessionAuthenticated(true);

    const selectedSiteId = parseTargetSiteId(target);
    if (selectedSiteId) {
        setSelectedSiteId(selectedSiteId);
    }

    if (!syncProfile) {
        return null;
    }

    const profile = (await tryFetchProfile()) ?? (await fetchProfile());
    setSessionProfile(profile as unknown as UserProfile$);
    return profile as unknown as UserProfile$;
};

/**
 * Loads the active relay profile and writes it into session identity state.
 */
export const loadRelayProfile = async (): Promise<UserProfile$> => {
    const profile = (await fetchProfile()) as unknown as UserProfile$;
    setSessionProfile(profile);
    return profile;
};

/**
 * Optimistically loads the active relay profile without throwing on auth failures.
 */
export const tryLoadRelayProfile = async (): Promise<UserProfile$ | null> => {
    const profile = (await tryFetchProfile()) as UserProfile$ | null;
    if (profile) {
        setSessionProfile(profile);
    }
    return profile;
};

/**
 * Applies a shallow patch to the current relay profile and rehydrates session identity state.
 */
export const patchRelayProfile = (patch: Record<string, unknown>): UserProfile$ | null => {
    const currentProfile = identityCore.getRelayProfile();
    if (!currentProfile) {
        return null;
    }

    const nextProfile = {
        ...currentProfile,
        $user: {
            ...currentProfile.$user,
            ...patch,
        },
    } as UserProfile$;

    setSessionProfile(nextProfile);
    return nextProfile;
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

    const oauthProvider = identityCore.getOAuthProvider();
    const isOnMobileApp = isNative();
    if (oauthProvider && isOnMobileApp) {
        webClient.post({ type: 'OAuthLogout', data: { provider: oauthProvider as OAuthLoginProvider } });
    }
    identityCore.setOAuthProvider(null);

    await webTransport.logout();
    cloudCore.clearSession();
    relayCore.clearSelectedSite();
    clearRelayTransportOverrides();
    resetWebCoreInit();
    localStorage.removeItem('chatic-device-token');

    setSessionAuthenticated(false);
    clearSessionCloudProfile();
    clearSessionProfile();
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
    cloudCore.clearDelegationToken();
    clearSessionCloudProfile();
    notifySessionStateChanged();
};

/**
 * Selects the relay-default cloud placeholder when no active cloud session should be attached.
 */
export const selectDefaultCloudSession = (): void => {
    setSelectedCloudId('default');
    setSelectedSiteId(null);
    clearSessionCloudProfile();
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
 * Updates the canonical relay profile record on the backend.
 */
export const updateRelayProfile = async (uid: string, user: Record<string, unknown>): Promise<void> => {
    try {
        await updateProfile(uid, user);
    } catch (error: any) {
        const is403 =
            error?.status === 403 ||
            error?.response?.status === 403 ||
            (error?.message && error.message.includes('403'));

        if (!is403) {
            throw error;
        }

        logger.info('PROFILE', 'Profile update got 403, attempting relay refresh before retry');
        await refreshRelaySession({ syncProfile: false });
        await updateProfile(uid, user);
    }
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

        const { Token: _token, ...cloudProfileUser } = userToken;
        setSessionCloudProfile(toCloudProfile(cloudProfileUser));
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

    // Relay site switch: re-issue the relay token scoped to the target site. The relay
    // profile uid pairs with the site to form the `uid@sid` target. syncProfile is off —
    // the relay profile does not change across sites, so skip the extra profile fetch.
    const uid = identityCore.getRelayProfile()?.uid;
    if (!uid) {
        throw new Error('No relay profile uid for site auth');
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

    const { Token: _token, ...cloudProfileUser } = merged;
    setSessionCloudProfile(toCloudProfile(cloudProfileUser));

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
