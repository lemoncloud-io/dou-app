import { isNative, logger, webClient } from '@chatic/bridges';
import type { OAuthLoginProvider } from '@chatic/app-messages';
import type { UserProfile$, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';
import { updateProfile } from '../api';
import { cloudCore, LANGUAGE_KEY, relayCore, resetWebCoreInit, startWebCoreInit } from '../core';
import { clearRelayTransportOverrides, webTransport } from '../transport';
import { getCloudSessionSnapshot } from './contexts';
import { getOAuthProvider, setOAuthProvider } from './sessionPersistence';
import {
    clearSessionProfile,
    getSessionAuthSnapshot,
    setSessionAuthenticated,
    setSessionIdentityState,
    setSessionProfile,
} from './sessionIdentity';
import { setSelectedCloudId, setSelectedSiteId } from './selection';
import { notifySessionStateChanged } from './utils';
import type { CloudSessionIssueTokenResult, CloudSessionSnapshot } from './types';

export interface LogoutOptions {
    preserveUrl?: boolean;
}

const logoutCallbacks = new Set<() => void>();

/**
 * Preserve the canonical profile identity when cloud tokens only provide a flat
 * user shape. Without this, early cloud selection can collapse profile fields
 * until the next full profile fetch.
 */
export const mergeCloudProfile = (current: UserProfile$ | null, cloudUser: Partial<UserView>): UserProfile$ =>
    ({
        ...current,
        ...cloudUser,
        uid: current?.uid ?? (cloudUser as { id?: string }).id,
        $user: current?.$user ?? (cloudUser as unknown as UserView),
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

// Invite-cloud bundle restoration is still backed by the deprecated persisted
// bundle store. Keep that detail inside the usecase boundary while callers
// move away from direct invited-cloud state access.
const restoreInvitedCloudState = (cloudId: string): boolean => {
    return applyInvitedCloud(cloudId);
};

export const initializeSession = async (): Promise<void> => {
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

export const logoutSession = async (options?: LogoutOptions): Promise<void> => {
    const searchBeforeCleanup = window.location.search;

    logoutCallbacks.forEach(callback => {
        try {
            callback();
        } catch (error) {
            logger.error('AUTH', 'Logout callback error', { error });
        }
    });
    logoutCallbacks.clear();

    const oauthProvider = getOAuthProvider();
    const isOnMobileApp = isNative();
    if (oauthProvider && isOnMobileApp) {
        webClient.post({ type: 'OAuthLogout', data: { provider: oauthProvider as OAuthLoginProvider } });
    }
    setOAuthProvider(null);

    await webTransport.logout();
    cloudCore.clearSession();
    relayCore.clearSelectedSite();
    clearRelayTransportOverrides();
    resetWebCoreInit();
    localStorage.removeItem('chatic-device-token');

    setSessionAuthenticated(false);
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

export const registerSessionLogoutCallback = (callback: () => void): (() => void) => {
    logoutCallbacks.add(callback);
    return () => logoutCallbacks.delete(callback);
};

export const updateSessionProfile = async (uid: string, user: Record<string, unknown>): Promise<void> => {
    await updateProfile(uid, user);
};

export const switchCloudSessionUseCase = async ({
    cloudId,
    issueCloudToken,
}: {
    cloudId: string;
    issueCloudToken: (cloudId: string) => Promise<CloudSessionIssueTokenResult>;
}): Promise<CloudSessionSnapshot> => {
    try {
        const previousCloudId = cloudCore.getSelectedCloudId();
        const { cloudDelegationToken, userToken } = await issueCloudToken(cloudId);

        cloudCore.saveDelegationToken(cloudDelegationToken);
        const existingToken = previousCloudId === cloudId ? cloudCore.getCloudToken() : null;
        cloudCore.saveCloudToken(existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken);
        cloudCore.saveSelectedCloudId(cloudId);

        if (previousCloudId !== cloudId) {
            cloudCore.clearSelectedSite();
            cloudCore.clearPlaceOrder(cloudId);
        }

        const currentProfile = getSessionAuthSnapshot().profile;
        const { Token: _token, ...cloudProfileUser } = userToken;
        setSessionProfile(mergeCloudProfile(currentProfile, cloudProfileUser));
        setSelectedCloudId(cloudId);

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudCore.getSelectedSiteId());
    } catch (error) {
        logger.error('SESSION', '[usecase] switchCloudSession failed', { error, data: { cloudId } });
        throw error;
    }
};

export const restoreInvitedCloudSessionUseCase = async (cloudId: string): Promise<CloudSessionSnapshot> => {
    try {
        if (!restoreInvitedCloudState(cloudId)) {
            throw new Error(`No invited-cloud session for ${cloudId}`);
        }

        const cloudToken = cloudCore.getCloudToken();
        if (cloudToken) {
            const currentProfile = getSessionAuthSnapshot().profile;
            const { Token: _token, ...cloudProfileUser } = cloudToken;
            setSessionProfile(mergeCloudProfile(currentProfile, cloudProfileUser));
        }

        const siteId = cloudCore.getSelectedSiteId();
        setSelectedCloudId(cloudId);
        if (siteId) {
            setSelectedSiteId(siteId);
        }

        return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, siteId);
    } catch (error) {
        logger.error('SESSION', '[usecase] restoreInvitedCloudSession failed', {
            error,
            data: { cloudId },
        });
        throw error;
    }
};

export const refreshCloudSiteSessionUseCase = async ({
    siteId,
    refreshCloudToken,
}: {
    siteId: string;
    refreshCloudToken: (target?: string) => Promise<UserTokenView>;
}): Promise<CloudSessionSnapshot> => {
    const cloudToken = cloudCore.getCloudToken();
    const uid = cloudToken?.id;
    if (!uid) {
        throw new Error('No cloud token uid for site auth');
    }

    const refreshed = await refreshCloudToken(`${uid}@${siteId}`);
    cloudCore.saveSelectedSiteId(siteId);
    setSelectedSiteId(siteId);

    const currentProfile = getSessionAuthSnapshot().profile;
    const { Token: _token, ...cloudProfileUser } = refreshed;
    setSessionProfile(mergeCloudProfile(currentProfile, cloudProfileUser));

    return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudCore.getSelectedCloudId() ?? 'default', siteId);
};
