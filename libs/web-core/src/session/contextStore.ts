import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { cloudCore, identityCore, relayCore } from './core';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { getPermissions, getUserType } from './types';
import { notifySessionStateChanged } from './utils';

interface UserViewExtended {
    userRole?: string;
}

type SessionIdentityState = Pick<IdentityContext, 'isInitialized' | 'isAuthenticated' | 'error'>;

const buildRelayContext = (): RelayContext => ({
    backend: relayCore.getBackend(),
    wss: relayCore.getWss(),
    identityToken: relayCore.getIdentityToken(),
    siteId: relayCore.getSelectedSiteId(),
    isAuthenticated: !!identityCore.getRelayProfile(),
});

const buildCloudContext = (): CloudContext => {
    const cloudId = cloudCore.getSelectedCloudId();
    const backend = cloudCore.getBackend();
    const wss = cloudCore.getWss();
    const identityToken = cloudCore.getIdentityToken();

    return {
        cloudId,
        siteId: cloudCore.getSelectedSiteId(),
        backend,
        wss,
        identityToken,
        delegationToken: cloudCore.getDelegationToken(),
        cloudToken: cloudCore.getCloudToken(),
        isActive: Boolean(cloudId && cloudId !== 'default' && backend && wss && identityToken),
    };
};

const buildIdentityContext = (state: SessionIdentityState): IdentityContext => {
    const relayProfile = identityCore.getRelayProfile();
    const cloudProfile = identityCore.getCloudProfile();
    const isInvited = identityCore.getIsInvited();
    const cloudToken = cloudCore.getCloudToken();
    const activeProfile = cloudProfile ?? relayProfile;
    const userRole =
        (activeProfile?.$user as { userRole?: string } | undefined)?.userRole ??
        (activeProfile as { userRole?: string } | undefined)?.userRole ??
        null;
    const isGuest = identityCore.getIsGuest() || userRole === 'guest';
    const userType = getUserType(activeProfile, isInvited, !!cloudToken);

    return {
        ...state,
        relayProfile,
        cloudProfile,
        activeProfile,
        userId: activeProfile?.uid ?? null,
        delegatorId: identityCore.getDelegatorId(),
        userRole,
        isInvited,
        isGuest,
        userName: activeProfile?.$user?.name || 'Unknown',
        oAuthProvider: identityCore.getOAuthProvider(),
        userType,
        permissions: getPermissions(userType),
    };
};

const readSessionIdentityState = (): SessionIdentityState => {
    const identity = identityState;
    return {
        isInitialized: identity.isInitialized,
        isAuthenticated: identity.isAuthenticated,
        error: identity.error,
    };
};

const resolveActiveServerContext = (relay: RelayContext, cloud: CloudContext): ActiveServerContext => {
    if (!cloud.isActive) {
        return {
            kind: 'relay',
            backend: relay.backend as string,
            wss: relay.wss as string,
            siteId: relay.siteId,
            identityToken: relay.identityToken,
        };
    }

    return {
        kind: 'cloud',
        cloudId: cloud.cloudId as string,
        siteId: cloud.siteId,
        backend: cloud.backend as string,
        wss: cloud.wss as string,
        identityToken: cloud.identityToken as string,
    };
};

let identityState = buildIdentityContext({
    isInitialized: false,
    isAuthenticated: !!identityCore.getRelayProfile(),
    error: null,
});

let cachedGlobalSessionContext: GlobalSessionContext | null = null;
let cachedSessionAuthSnapshot: ReturnType<typeof getSessionAuthSnapshotRaw> | null = null;

const getSessionAuthSnapshotRaw = () => {
    const { isInitialized, isAuthenticated, error, activeProfile } = identityState;
    return { isInitialized, isAuthenticated, error, activeProfile };
};

const getGlobalSessionContext = (): GlobalSessionContext => {
    if (cachedGlobalSessionContext) return cachedGlobalSessionContext;
    const relay = buildRelayContext();
    const cloud = buildCloudContext();
    cachedGlobalSessionContext = {
        relay,
        cloud,
        identity: identityState,
        activeServer: resolveActiveServerContext(relay, cloud),
    };
    return cachedGlobalSessionContext;
};

export const sessionContextStore = {
    getRelayContext: (): RelayContext => getGlobalSessionContext().relay,
    getCloudContext: (): CloudContext => getGlobalSessionContext().cloud,
    getIdentityContext: (): IdentityContext => identityState,
    getGlobalSessionContext,
    getCloudSessionSnapshot: (): CloudSessionSnapshot | null => {
        const cloud = buildCloudContext();
        if (!cloud.cloudId || !cloud.backend || !cloud.wss || !cloud.identityToken) {
            return null;
        }

        return {
            cloudId: cloud.cloudId,
            siteId: cloud.siteId,
            identityToken: cloud.identityToken,
            backend: cloud.backend,
            wss: cloud.wss,
        };
    },
    setIdentityState: (nextState: IdentityContext): void => {
        identityState = nextState;
    },
    updateIdentityState: (updater: (current: IdentityContext) => IdentityContext): void => {
        identityState = updater(identityState);
    },
};

export const getSessionAuthSnapshot = () => {
    if (cachedSessionAuthSnapshot) return cachedSessionAuthSnapshot;
    cachedSessionAuthSnapshot = getSessionAuthSnapshotRaw();
    return cachedSessionAuthSnapshot;
};

export const getSelectedCloudId = (): string => cloudCore.getSelectedCloudId() || 'default';

export const getSelectedSiteId = (): string | null =>
    getSelectedCloudId() === 'default' ? relayCore.getSelectedSiteId() : cloudCore.getSelectedSiteId();

export const setSelectedCloudId = (cloudId: string): void => {
    cloudCore.saveSelectedCloudId(cloudId);
};

export const setSelectedSiteId = (siteId: string | null): void => {
    const selectedCloudId = getSelectedCloudId();
    if (siteId) {
        if (selectedCloudId === 'default') {
            relayCore.saveSelectedSiteId(siteId);
        } else {
            cloudCore.saveSelectedSiteId(siteId);
        }
        return;
    }

    if (selectedCloudId === 'default') {
        relayCore.clearSelectedSite();
    } else {
        cloudCore.clearSelectedSite();
    }
};

export const setSessionAuthenticated = (isAuthenticated: boolean): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated }));
    notifySessionStateChanged();
};

export const setSessionProfile = (profile: UserProfile$): void => {
    identityCore.setRelayProfile(profile);
    const userRoleGuest =
        (profile.$user as UserViewExtended)?.userRole === 'guest' || (profile as any)?.userRole === 'guest';
    if (userRoleGuest && profile.uid) {
        identityCore.setDelegatorId(profile.uid);
    } else {
        identityCore.setDelegatorId(null);
    }
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: true }));
    notifySessionStateChanged();
};

export const clearSessionProfile = (): void => {
    identityCore.setRelayProfile(null);
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: false }));
    notifySessionStateChanged();
};

export const setSessionCloudProfile = (profile: UserProfile$ | null): void => {
    identityCore.setCloudProfile(profile);
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext(state));
    notifySessionStateChanged();
};

export const clearSessionCloudProfile = (): void => {
    identityCore.setCloudProfile(null);
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext(state));
    notifySessionStateChanged();
};

export const setSessionIdentityState = (partial: Partial<SessionIdentityState>): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(
        buildIdentityContext({
            isInitialized: partial.isInitialized ?? state.isInitialized,
            isAuthenticated: partial.isAuthenticated ?? state.isAuthenticated,
            error: partial.error !== undefined ? partial.error : state.error,
        })
    );
    notifySessionStateChanged();
};

export const markSessionInitialized = (): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isInitialized: true }));
    notifySessionStateChanged();
};
