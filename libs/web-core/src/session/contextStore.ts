import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { cloudCore, identityCore, relayCore } from './core';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { notifySessionStateChanged, registerSessionCacheInvalidator } from './utils';

type SessionIdentityState = Pick<IdentityContext, 'isInitialized' | 'isAuthenticated' | 'error'>;

const buildRelayContext = (): RelayContext => ({
    backend: relayCore.getBackend(),
    wss: relayCore.getWss(),
    identityToken: relayCore.getIdentityToken(),
    siteId: relayCore.getSelectedSiteId(),
    isAuthenticated: !!relayCore.getRelayToken(),
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

// The active session token (cloud wins when a cloud session is active, mirroring activeServer
// resolution). The full UserProfile$ payload is no longer stored — the raw token is already
// persisted for auth (relayCore/cloudCore), and uid + the profile seed derive from it on demand.
const getActiveSessionToken = (): UserTokenView | null => {
    const cloudActive = buildCloudContext().isActive;
    return (cloudActive ? cloudCore.getCloudToken() : relayCore.getRelayToken()) ?? null;
};

/**
 * The active token's user fields ({ userRole, name, photo, ... }) — the synchronous seed for
 * `useProfileFacts` (guard flash prevention). Strips the `Token` carrier; prefers an embedded
 * `$user`, else the flat token view. Returns null when there is no session.
 */
export const getActiveSessionUser = (): Record<string, unknown> | null => {
    const token = getActiveSessionToken();
    if (!token) return null;
    const { Token: _token, ...view } = token as unknown as Record<string, unknown> & { Token?: unknown };
    return ((view as { $user?: Record<string, unknown> }).$user ?? view) as Record<string, unknown>;
};

const buildIdentityContext = (state: SessionIdentityState): IdentityContext => {
    // Pure state store: the uid (for cache observing) + session flags. Profile facts
    // (userRole/isGuest/userType/permissions/name) are tracked from the cached profile via
    // useProfileFacts (@chatic/app-runtime); the profile payload is not stored here.
    const token = getActiveSessionToken() as { uid?: string; id?: string } | null;

    return {
        ...state,
        userId: token?.uid ?? token?.id ?? null,
        delegatorId: identityCore.getDelegatorId(),
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
    isAuthenticated: !!relayCore.getRelayToken(),
    error: null,
});

let cachedGlobalSessionContext: GlobalSessionContext | null = null;
let cachedSessionAuthSnapshot: ReturnType<typeof getSessionAuthSnapshotRaw> | null = null;

registerSessionCacheInvalidator(() => {
    cachedGlobalSessionContext = null;
    cachedSessionAuthSnapshot = null;
});

const getSessionAuthSnapshotRaw = () => {
    const { isInitialized, isAuthenticated, error } = identityState;
    return { isInitialized, isAuthenticated, error };
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

// Rebuilds identity from the current token/flag storage and notifies subscribers. Call after a
// caller changes the underlying session tokens (relay/cloud) so token-derived fields (uid,
// delegatorId, flags) refresh. Profile payloads are no longer stored, so there is nothing to set
// beyond re-deriving from state.
export const rebuildSessionIdentity = (): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext(state));
    notifySessionStateChanged();
};

// Tears down the relay session: drops the relay token (the auth anchor) so token-derived auth
// (buildRelayContext, module init) clears in-session, then rebuilds identity as unauthenticated.
export const clearRelaySession = (): void => {
    relayCore.clearToken();
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: false }));
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
