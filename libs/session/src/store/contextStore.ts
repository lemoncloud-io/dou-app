import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { cloudStore, identityStore, relayStore } from './stores';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { sessionSignal } from './signal';

type SessionIdentityState = Pick<IdentityContext, 'isInitialized' | 'isAuthenticated' | 'error'>;

const buildRelayContext = (): RelayContext => ({
    backend: relayStore.getBackend(),
    wss: relayStore.getWss(),
    identityToken: relayStore.getIdentityToken(),
    siteId: relayStore.getSelectedSiteId(),
    isAuthenticated: !!relayStore.getRelayToken(),
});

const buildCloudContext = (): CloudContext => {
    const cloudId = cloudStore.getSelectedCloudId();
    const backend = cloudStore.getBackend();
    const wss = cloudStore.getWss();
    const identityToken = cloudStore.getIdentityToken();

    return {
        cloudId,
        siteId: cloudStore.getSelectedSiteId(),
        backend,
        wss,
        identityToken,
        delegationToken: cloudStore.getDelegationToken(),
        cloudToken: cloudStore.getCloudToken(),
        isActive: Boolean(cloudId && cloudId !== 'default' && backend && wss && identityToken),
    };
};

const getActiveSessionToken = (): UserTokenView | null => {
    const cloudActive = buildCloudContext().isActive;
    return (cloudActive ? cloudStore.getCloudToken() : relayStore.getRelayToken()) ?? null;
};

export const getActiveSessionUser = (): Record<string, unknown> | null => {
    const token = getActiveSessionToken();
    if (!token) return null;
    const { Token: _token, ...view } = token as unknown as Record<string, unknown> & { Token?: unknown };
    return ((view as { $user?: Record<string, unknown> }).$user ?? view) as Record<string, unknown>;
};

export const getRelaySessionUser = (): Record<string, unknown> | null => {
    const token = relayStore.getRelayToken();
    if (!token) return null;
    const { Token: _token, ...view } = token as unknown as Record<string, unknown> & { Token?: unknown };
    return ((view as { $user?: Record<string, unknown> }).$user ?? view) as Record<string, unknown>;
};

export const patchRelaySessionUser = (patch: Record<string, unknown>): void => {
    const token = relayStore.getRelayToken();
    if (!token) return;
    const { Token: _token, ...rest } = patch as Record<string, unknown> & { Token?: unknown };
    const carrier = token as unknown as Record<string, unknown> & { $user?: Record<string, unknown> };
    const merged = carrier.$user ? { ...carrier, $user: { ...carrier.$user, ...rest } } : { ...carrier, ...rest };
    relayStore.saveRelayToken(merged as unknown as UserTokenView);
};

const uidOfToken = (token: UserTokenView | null): string | null => {
    const view = token as { uid?: string; id?: string } | null;
    return view?.uid ?? view?.id ?? null;
};

export const getUidInCloud = (cloudId: string): string | null => {
    if (cloudId === RELAY_CLOUD_ID) return uidOfToken(relayStore.getRelayToken());
    return uidOfToken(cloudStore.getCloudTokenOf(cloudId)) ?? cloudStore.getCloudIdentity(cloudId)?.uid ?? null;
};

export const getUidsInClouds = (): Record<string, string> => {
    const cloudIds = new Set<string>([RELAY_CLOUD_ID, ...cloudStore.getCachedCloudIds(), ...getRecordedCloudIds()]);
    const committed = cloudStore.getDelegationToken()?.cloudId;
    if (committed) cloudIds.add(committed);
    const uids: Record<string, string> = {};
    for (const cloudId of cloudIds) {
        const uid = getUidInCloud(cloudId);
        if (uid) uids[cloudId] = uid;
    }
    return uids;
};

export const getRecordedCloudIds = (): string[] => Object.keys(cloudStore.getCloudIdentities());

const buildIdentityContext = (state: SessionIdentityState): IdentityContext => {
    return {
        ...state,
        userId: uidOfToken(getActiveSessionToken()),
        delegatorId: identityStore.getDelegatorId(),
    };
};

const readSessionIdentityState = (): SessionIdentityState => {
    const identity = identityStateRef();
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

let identityStateOrNull: IdentityContext | null = null;

const identityStateRef = (): IdentityContext => {
    if (!identityStateOrNull) {
        identityStateOrNull = buildIdentityContext({
            isInitialized: false,
            isAuthenticated: !!relayStore.getRelayToken(),
            error: null,
        });
    }
    return identityStateOrNull;
};

let cachedGlobalSessionContext: GlobalSessionContext | null = null;
let cachedSessionAuthSnapshot: ReturnType<typeof getSessionAuthSnapshotRaw> | null = null;
let cachedSocketSlotContext: SocketSlotContext | null = null;

sessionSignal.registerInvalidator(() => {
    cachedGlobalSessionContext = null;
    cachedSessionAuthSnapshot = null;
    cachedSocketSlotContext = null;
});

const getSessionAuthSnapshotRaw = () => {
    const { isInitialized, isAuthenticated, error } = identityStateRef();
    return { isInitialized, isAuthenticated, error };
};

const getGlobalSessionContext = (): GlobalSessionContext => {
    if (cachedGlobalSessionContext) return cachedGlobalSessionContext;
    const relay = buildRelayContext();
    const cloud = buildCloudContext();
    cachedGlobalSessionContext = {
        relay,
        cloud,
        identity: identityStateRef(),
        activeServer: resolveActiveServerContext(relay, cloud),
    };
    return cachedGlobalSessionContext;
};

export interface SocketSlotContext {
    relay: RelayContext;
    cloud: CloudContext;
}

const getSocketSlotContext = (): SocketSlotContext => {
    if (cachedSocketSlotContext) return cachedSocketSlotContext;
    const { relay, cloud } = getGlobalSessionContext();
    cachedSocketSlotContext = { relay, cloud };
    return cachedSocketSlotContext;
};

export const sessionContextStore = {
    getCloudContext: (): CloudContext => getGlobalSessionContext().cloud,
    getSocketSlotContext,
    getIdentityContext: (): IdentityContext => identityStateRef(),
    getGlobalSessionContext,
    getCloudSessionSnapshot: (): CloudSessionSnapshot | null => {
        const cloud = getGlobalSessionContext().cloud;
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
        identityStateOrNull = nextState;
    },
};

export const getSessionAuthSnapshot = () => {
    if (cachedSessionAuthSnapshot) return cachedSessionAuthSnapshot;
    cachedSessionAuthSnapshot = getSessionAuthSnapshotRaw();
    return cachedSessionAuthSnapshot;
};

export const getSelectedCloudId = (): string => cloudStore.getSelectedCloudId() || 'default';

export const getSelectedSiteId = (): string | null =>
    getSelectedCloudId() === 'default' ? relayStore.getSelectedSiteId() : cloudStore.getSelectedSiteId();

export const setSelectedSiteId = (siteId: string | null): void => {
    const selectedCloudId = getSelectedCloudId();
    if (siteId) {
        if (selectedCloudId === 'default') {
            relayStore.saveSelectedSiteId(siteId);
        } else {
            cloudStore.saveSelectedSiteId(siteId);
        }
        return;
    }

    if (selectedCloudId === 'default') {
        relayStore.clearSelectedSite();
    } else {
        cloudStore.clearSelectedSite();
    }
};

export const setSessionAuthenticated = (isAuthenticated: boolean): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated }));
    sessionSignal.emit('identity');
};

const sameIdentityContext = (a: IdentityContext, b: IdentityContext): boolean =>
    a.userId === b.userId &&
    a.delegatorId === b.delegatorId &&
    a.isInitialized === b.isInitialized &&
    a.isAuthenticated === b.isAuthenticated &&
    a.error === b.error;

export const rebuildSessionIdentity = (): void => {
    const before = getGlobalSessionContext();
    const nextIdentity = buildIdentityContext(readSessionIdentityState());

    if (sameIdentityContext(before.identity, nextIdentity)) {
        return;
    }

    sessionContextStore.setIdentityState(nextIdentity);
    sessionSignal.emit('identity');
};

export const clearRelaySession = (): void => {
    sessionSignal.batch(() => {
        relayStore.clearToken();
        identityStore.setDelegatorId(null);
        const state = readSessionIdentityState();
        sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isAuthenticated: false }));
        sessionSignal.emit('identity');
    });
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
    sessionSignal.emit('identity');
};

export const markSessionInitialized = (): void => {
    const state = readSessionIdentityState();
    sessionContextStore.setIdentityState(buildIdentityContext({ ...state, isInitialized: true }));
    sessionSignal.emit('identity');
};
