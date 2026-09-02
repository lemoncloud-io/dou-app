import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { cloudStore, identityStore, relayStore } from './stores';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { notifySessionStateChanged, registerSessionCacheInvalidator } from './signal';

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

// The active session token (cloud wins when a cloud session is active, mirroring activeServer
// resolution). The full UserProfile$ payload is no longer stored — the raw token is already
// persisted for auth (relayStore/cloudStore), and uid + the profile seed derive from it on demand.
const getActiveSessionToken = (): UserTokenView | null => {
    const cloudActive = buildCloudContext().isActive;
    return (cloudActive ? cloudStore.getCloudToken() : relayStore.getRelayToken()) ?? null;
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

/**
 * The user fields of the RELAY token specifically — the ACCOUNT identity, regardless of which slot
 * is active. Same extraction as {@link getActiveSessionUser}, but never cloud-wins.
 *
 * This is the read half of the account-level profile source: account screens (MY page and what it
 * opens) must show the relay account no matter which cloud the user is connected to, and the local
 * cache cannot answer that question — its physical key is `${type}:${cid}:${uid}:${id}` and the read
 * path ignores context overrides, so while a cloud is active the relay `user` row is unreachable
 * (see apps/web/docs/feature/place/relay-default-place-scoping.md §6). The relay token, by contrast,
 * is always present and always the relay account's: it carries `name`/`photo`/`email`/`link$`
 * because `UserTokenView extends UserView extends Partial<UserModel>`.
 *
 * Synchronous and allocation-cheap on purpose — callers re-read it on each session signal rather
 * than holding a copy, so a token refresh or a profile save fans out with no cache to invalidate.
 */
export const getRelaySessionUser = (): Record<string, unknown> | null => {
    const token = relayStore.getRelayToken();
    if (!token) return null;
    const { Token: _token, ...view } = token as unknown as Record<string, unknown> & { Token?: unknown };
    return ((view as { $user?: Record<string, unknown> }).$user ?? view) as Record<string, unknown>;
};

/**
 * Merges display fields (name/photo/…) into the STORED relay token — the write half of the same
 * source. Used after a relay-pinned `user.update` or `user.profile` so every reader of
 * {@link getRelaySessionUser} sees the new value immediately, and so the next cold start seeds from
 * the fresh one.
 *
 * Patches inside `$user` when the token carries that wrapper, mirroring the read's preference, so
 * the value written is the value read back. `Token` is never touched: it is the auth carrier, and a
 * display patch has no business rewriting credentials. `saveRelayToken` notifies session listeners,
 * which is what makes this reactive. No-op without a relay session.
 */
export const patchRelaySessionUser = (patch: Record<string, unknown>): void => {
    const token = relayStore.getRelayToken();
    if (!token) return;
    const { Token: _token, ...rest } = patch as Record<string, unknown> & { Token?: unknown };
    const carrier = token as unknown as Record<string, unknown> & { $user?: Record<string, unknown> };
    const merged = carrier.$user ? { ...carrier, $user: { ...carrier.$user, ...rest } } : { ...carrier, ...rest };
    relayStore.saveRelayToken(merged as unknown as UserTokenView);
};

const buildIdentityContext = (state: SessionIdentityState): IdentityContext => {
    // Pure state store: the uid (for cache observing) + session flags. Profile facts
    // (userRole/isGuest/userType/permissions/name) are tracked from the cached profile via
    // useProfileFacts (@chatic/app-runtime); the profile payload is not stored here.
    const token = getActiveSessionToken() as { uid?: string; id?: string } | null;

    return {
        ...state,
        userId: token?.uid ?? token?.id ?? null,
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

/**
 * Seeded on FIRST READ, not at module load. The seed reads the relay token out of storage, and doing
 * that during import made the store's correctness depend on import order — a consumer that pulled the
 * session barrel before the storage adapter was installed got a hard failure at import time rather
 * than a null session. Lazy init keeps the module import side-effect-free, which is what "passive
 * store" is supposed to mean (ADR-0070 결정 1 규칙 1).
 */
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

registerSessionCacheInvalidator(() => {
    cachedGlobalSessionContext = null;
    cachedSessionAuthSnapshot = null;
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

export const sessionContextStore = {
    getRelayContext: (): RelayContext => getGlobalSessionContext().relay,
    getCloudContext: (): CloudContext => getGlobalSessionContext().cloud,
    getIdentityContext: (): IdentityContext => identityStateRef(),
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
        identityStateOrNull = nextState;
    },
    updateIdentityState: (updater: (current: IdentityContext) => IdentityContext): void => {
        identityStateOrNull = updater(identityStateRef());
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

export const setSelectedCloudId = (cloudId: string): void => {
    cloudStore.saveSelectedCloudId(cloudId);
};

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
    notifySessionStateChanged();
};

// Field-level equality over the fields observers actually read. Token carriers (delegationToken/
// cloudToken) are compared by reference: they are only ever REPLACED on save, never mutated, so `===`
// can only report "unchanged" for a genuine no-op — it never masks a real change.
const sameRelayContext = (a: RelayContext, b: RelayContext): boolean =>
    a.backend === b.backend &&
    a.wss === b.wss &&
    a.identityToken === b.identityToken &&
    a.siteId === b.siteId &&
    a.isAuthenticated === b.isAuthenticated;

const sameCloudContext = (a: CloudContext, b: CloudContext): boolean =>
    a.cloudId === b.cloudId &&
    a.siteId === b.siteId &&
    a.backend === b.backend &&
    a.wss === b.wss &&
    a.identityToken === b.identityToken &&
    a.isActive === b.isActive &&
    a.delegationToken === b.delegationToken &&
    a.cloudToken === b.cloudToken;

const sameIdentityContext = (a: IdentityContext, b: IdentityContext): boolean =>
    a.userId === b.userId &&
    a.delegatorId === b.delegatorId &&
    a.isInitialized === b.isInitialized &&
    a.isAuthenticated === b.isAuthenticated &&
    a.error === b.error;

// Rebuilds identity from the current token/flag storage and notifies subscribers. Call after a
// caller changes the underlying session tokens (relay/cloud) so token-derived fields (uid,
// delegatorId, flags) refresh. Profile payloads are no longer stored, so there is nothing to set
// beyond re-deriving from state.
//
// Gated notify: a token writeback frequently re-derives an IDENTICAL observable context — most
// notably a background relay credential refresh while cloud is active (dual 5min refresh loops),
// which changes neither uid nor any field observers read. Notifying then fans out a no-op re-render
// to every useGlobalSession subscriber and rebuilds useRuntimeBinding. Skip the fan-out unless the
// derived context actually changed. `before` is the cached (pre-writeback) context; the freshly
// built relay/cloud reflect post-writeback core storage, so a genuine change is still detected.
export const rebuildSessionIdentity = (): void => {
    const before = getGlobalSessionContext();
    const nextIdentity = buildIdentityContext(readSessionIdentityState());
    const relay = buildRelayContext();
    const cloud = buildCloudContext();

    if (
        sameIdentityContext(before.identity, nextIdentity) &&
        sameRelayContext(before.relay, relay) &&
        sameCloudContext(before.cloud, cloud)
    ) {
        return;
    }

    sessionContextStore.setIdentityState(nextIdentity);
    notifySessionStateChanged();
};

// Tears down the relay session: drops the relay token (the auth anchor) so token-derived auth
// (buildRelayContext, module init) clears in-session, then rebuilds identity as unauthenticated.
// Also clears the guest delegatorId — it's a relay-guest concept and must only be re-established by
// the next guest login (relay logout is the sole reset boundary).
export const clearRelaySession = (): void => {
    relayStore.clearToken();
    identityStore.setDelegatorId(null);
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
