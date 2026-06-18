import { cloudCore } from '../core';
import { relayCore } from '../core';
import { getDelegatorId, getIsInvited, getOAuthProvider, readCachedProfile } from './sessionPersistence';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { getPermissions, getUserType } from './types';

const buildRelayContext = (): RelayContext => ({
    backend: relayCore.getBackend(),
    wss: relayCore.getWss(),
    identityToken: null,
    siteId: relayCore.getSelectedSiteId(),
    isAuthenticated: !!readCachedProfile(),
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

const buildIdentityContext = (): IdentityContext => {
    const profile = readCachedProfile();
    const isInvited = getIsInvited();
    const cloudToken = cloudCore.getCloudToken();
    const userRole = (profile?.$user as { userRole?: string } | undefined)?.userRole ?? null;
    const isAuthenticated = !!profile;
    const isGuest = userRole === 'guest' && !isInvited;
    const isCloudUser = isInvited || userRole === 'user';
    const userType = getUserType(profile, isInvited, !!cloudToken);

    return {
        isInitialized: false,
        isAuthenticated,
        isOnMobileApp: false,
        error: null,
        profile,
        userId: profile?.uid ?? null,
        delegatorId: getDelegatorId(),
        userRole,
        isInvited,
        isGuest,
        isCloudUser,
        userName: profile?.$user?.name || 'Unknown',
        oAuthProvider: getOAuthProvider(),
        userType,
        permissions: getPermissions(userType),
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

let identityState = buildIdentityContext();

const getGlobalSessionContext = (): GlobalSessionContext => {
    const relay = buildRelayContext();
    const cloud = buildCloudContext();

    return {
        relay,
        cloud,
        identity: identityState,
        activeServer: resolveActiveServerContext(relay, cloud),
    };
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
