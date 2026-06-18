import type {
    ActiveRuntimeTarget,
    CloudSessionContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    RelaySessionContext,
    SessionIdentityContext,
} from './types';
import { sessionProfileResolver } from './profiles';

export const getRelaySessionContext = (): RelaySessionContext => {
    return sessionProfileResolver.getRelayProfile().toContext();
};

export const getCloudSessionContext = (): CloudSessionContext => sessionProfileResolver.getCloudProfile().toContext();

export const getSessionIdentityContext = (): SessionIdentityContext => sessionProfileResolver.getIdentityContext();

export const getCloudSessionSnapshot = (): CloudSessionSnapshot | null => {
    const session = getCloudSessionContext();
    if (!session.cloudId || !session.backend || !session.wss || !session.identityToken) {
        return null;
    }

    return {
        cloudId: session.cloudId,
        siteId: session.siteId,
        identityToken: session.identityToken,
        backend: session.backend,
        wss: session.wss,
    };
};

const resolveActiveRuntimeTarget = (relay: RelaySessionContext, cloud: CloudSessionContext): ActiveRuntimeTarget => {
    if (cloud.cloudId && cloud.backend && cloud.wss && cloud.identityToken) {
        return {
            kind: 'cloud',
            cloudId: cloud.cloudId,
            siteId: cloud.siteId,
            backend: cloud.backend,
            wss: cloud.wss,
            identityToken: cloud.identityToken,
        };
    }

    return {
        kind: 'relay',
        backend: relay.backend as string,
        wss: relay.wss as string,
        siteId: relay.siteId,
        identityToken: relay.identityToken,
    };
};

export const getGlobalSessionContext = (): GlobalSessionContext => {
    const relay = getRelaySessionContext();
    const cloud = getCloudSessionContext();
    const identity = getSessionIdentityContext();
    return {
        relay,
        cloud,
        identity,
        activeTarget: resolveActiveRuntimeTarget(relay, cloud),
    };
};

export const clearCloudSession = (): void => {
    sessionProfileResolver.getCloudProfile().clearSession();
};
