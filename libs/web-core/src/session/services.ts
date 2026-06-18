import { isNative, logger, webClient } from '@chatic/bridges';
import { storage } from '@chatic/shared';
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
import {
    CLOUD_INVITED_BUNDLES_KEY,
    cloudCore,
    identityCore,
    LANGUAGE_KEY,
    relayCore,
    resetWebCoreInit,
    startWebCoreInit,
} from './core';
import {
    clearSessionCloudProfile,
    clearSessionProfile,
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

/**
 * Restores an invited cloud bundle from persisted storage into the current cloud session state.
 */
const restoreInvitedCloudState = (cloudId: string): boolean => {
    try {
        const raw = storage.get(CLOUD_INVITED_BUNDLES_KEY);
        if (!raw) return false;

        const bundles = JSON.parse(raw) as Record<
            string,
            {
                cloudDelegationToken?: unknown;
                cloudToken?: unknown;
                selectedSiteId?: string | null;
            }
        >;

        const bundle = bundles[cloudId];
        if (!bundle?.cloudDelegationToken || !bundle?.cloudToken) {
            return false;
        }

        cloudCore.saveDelegationToken(
            bundle.cloudDelegationToken as Parameters<typeof cloudCore.saveDelegationToken>[0]
        );
        cloudCore.saveCloudToken(bundle.cloudToken as Parameters<typeof cloudCore.saveCloudToken>[0]);
        cloudCore.saveSelectedCloudId(cloudId);

        if (bundle.selectedSiteId) {
            cloudCore.saveSelectedSiteId(bundle.selectedSiteId);
        } else {
            cloudCore.clearSelectedSite();
        }

        return true;
    } catch (error) {
        logger.error('SESSION', '[service] restore invited cloud bundle parse failed', { error, data: { cloudId } });
        return false;
    }
};

/**
 * Applies the relay-facing profile fields returned alongside a relay token issuance response.
 */
const applyRelayProfile = (tokenView: UserTokenView): UserTokenView => {
    const { Token: _token, ...profile } = tokenView;
    setSessionProfile(profile as unknown as UserProfile$);
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
        isOnMobileApp: isNative(),
    });
};

/**
 * Persists the current device identifier for later relay login and restore flows.
 */
export const persistDeviceId = (deviceId: string): string => {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
};

/**
 * Creates a guest relay session from a device identifier and stores the resulting relay identity.
 */
export const loginRelayGuestByDevice = async (deviceId: string): Promise<UserTokenView> => {
    persistDeviceId(deviceId);
    identityCore.setIsInvited(false);
    identityCore.setOAuthProvider(null);
    return applyRelayProfile(await registerDevice(deviceId));
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
    return applyRelayProfile(await loginRelayRequest(body, email));
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
    return applyRelayProfile(tokenView);
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
    return applyRelayProfile(tokenView);
};

/**
 * Refreshes the relay OAuth session and optionally switches the active relay site via `uid@sid`.
 */
export const refreshRelaySession = async ({
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
 */
export const switchCloudSession = async ({ cloudId }: { cloudId: string }): Promise<CloudSessionSnapshot> => {
    try {
        const previousCloudId = cloudCore.getSelectedCloudId();
        const cloudDelegationToken = await issueCloudDelegationToken(cloudId);
        const userToken = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

        cloudCore.saveDelegationToken(cloudDelegationToken);
        const existingToken = previousCloudId === cloudId ? cloudCore.getCloudToken() : null;
        cloudCore.saveCloudToken(existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken);
        cloudCore.saveSelectedCloudId(cloudId);

        if (previousCloudId !== cloudId) {
            cloudCore.clearSelectedSite();
            cloudCore.clearPlaceOrder(cloudId);
        }

        const { Token: _token, ...cloudProfileUser } = userToken;
        setSessionCloudProfile(toCloudProfile(cloudProfileUser));
        setSelectedCloudId(cloudId);

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudCore.getSelectedSiteId());
    } catch (error) {
        logger.error('SESSION', '[service] switchCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

/**
 * Restores a previously persisted cloud session, typically from an invited-cloud cache.
 */
export const restorePreviousCloudSession = async (cloudId: string): Promise<CloudSessionSnapshot> => {
    try {
        if (!restoreInvitedCloudState(cloudId)) {
            throw new Error(`No invited-cloud session for ${cloudId}`);
        }

        const cloudToken = cloudCore.getCloudToken();
        if (cloudToken) {
            const { Token: _token, ...cloudProfileUser } = cloudToken;
            setSessionCloudProfile(toCloudProfile(cloudProfileUser));
        }

        const siteId = cloudCore.getSelectedSiteId();
        setSelectedCloudId(cloudId);
        if (siteId) {
            setSelectedSiteId(siteId);
        }

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, siteId);
    } catch (error) {
        logger.error('SESSION', '[service] restorePreviousCloudSession failed', {
            error,
            data: { cloudId },
        });
        throw error;
    }
};

/**
 * Refreshes the active cloud session and optionally switches the active cloud site.
 */
export const refreshCloudSession = async ({ siteId }: { siteId: string }): Promise<CloudSessionSnapshot> => {
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

export const initializeSession = initializeRelaySession;
export const logoutSession = logoutRelaySession;
export const switchCloudSessionUseCase = switchCloudSession;
export const restoreInvitedCloudSessionUseCase = restorePreviousCloudSession;
export const refreshCloudSiteSessionUseCase = refreshCloudSession;
export const updateSessionProfile = updateRelayProfile;
