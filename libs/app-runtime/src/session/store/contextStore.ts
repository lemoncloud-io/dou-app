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

sessionSignal.registerInvalidator(() => {
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
    getCloudContext: (): CloudContext => getGlobalSessionContext().cloud,
    getIdentityContext: (): IdentityContext => identityStateRef(),
    getGlobalSessionContext,
    // Reads through the CACHED context, not a fresh `buildCloudContext()`. Building directly meant
    // this accessor could answer from post-write storage while every other reader in the same tick
    // still saw the cached (pre-write) context — two callers disagreeing about one session. The cache
    // is dropped on every session notify, so "cached" here only ever means "same as this tick's
    // other readers".
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
    sessionSignal.emit('identity');
};

// Field-level equality over the fields observers actually read.
//
// The relay and cloud comparators that used to sit here are gone with the gate that needed them:
// when the notify was one payload-less broadcast, `rebuildSessionIdentity` had to prove that NOTHING
// observable moved before staying quiet. Now the stores announce their own kinds, so the only thing
// this file still gates is the derived identity (ADR-0074 결정 2).
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
// Gated emit: a token writeback frequently re-derives an IDENTICAL identity — most notably a
// background relay credential refresh while cloud is active (dual 5min refresh loops), which changes
// neither uid nor any field observers read. Emitting then fans out a no-op re-render to every
// `useGlobalSession` subscriber.
//
// The gate now compares IDENTITY ONLY. It used to also compare the relay and cloud contexts, and it
// had to: the notify was a single payload-less broadcast, so this function was indistinguishable
// from "some token moved" and had to check everything before staying quiet. With kinds
// (ADR-0074 결정 2) the token moves announce themselves — every caller of this function has already
// written through a store, which emitted `relay:token`/`cloud:token` on the way in. All that is left
// for this function to announce is whether the DERIVED identity moved.
export const rebuildSessionIdentity = (): void => {
    const before = getGlobalSessionContext();
    const nextIdentity = buildIdentityContext(readSessionIdentityState());

    if (sameIdentityContext(before.identity, nextIdentity)) {
        return;
    }

    sessionContextStore.setIdentityState(nextIdentity);
    sessionSignal.emit('identity');
};

// Tears down the relay session: drops the relay token (the auth anchor) so token-derived auth
// (buildRelayContext, module init) clears in-session, then rebuilds identity as unauthenticated.
// Also clears the guest delegatorId — it's a relay-guest concept and must only be re-established by
// the next guest login (relay logout is the sole reset boundary).
export const clearRelaySession = (): void => {
    // One observable change: the token drop, the delegator reset and the identity rebuild are one
    // logical teardown. The inner writes emit `relay:token`/`identity` themselves.
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
