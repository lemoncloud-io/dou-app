import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { storage } from '@chatic/shared';
import { notifySessionStateChanged } from '../utils';

export const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
export const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
export const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
export const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';
export const CLOUD_PLACE_ORDER_KEY_PREFIX = 'chatic-place-order-';
export const CLOUD_INVITED_BUNDLES_KEY = 'chatic-invited-clouds';
// Per-cloud token cache: lets a re-switch to a recently-visited cloud reuse its delegation + cloud
// token instead of re-issuing them over 2 HTTP round trips, so the cloud identity (uid) — and thus
// the cid+uid-scoped local cache — is available instantly on switch.
export const CLOUD_TOKEN_CACHE_KEY = 'chatic-cloud-token-cache';
// Skip a cached cloud token whose AWS credential expires within this margin — the fresh token is
// re-issued instead so the socket never connects with a credential about to lapse.
const CLOUD_TOKEN_CACHE_MARGIN_MS = 60_000;

/** A cloud's delegation + user token, cached by cloudId for fast re-switch. */
export interface CachedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

/**
 * A durable registry entry for an invited cloud. Invited clouds have no server-side
 * enumeration API, so their ids are kept here in localStorage — a store independent of
 * the app-runtime cache DB (IndexedDB/SQLite). If the cache DB is wiped, this registry
 * survives and lets boot/push recovery re-derive `backend`/`wss` via
 * `issueCloudDelegationToken(cloudId)`. `name` is cosmetic (not re-derivable). See
 * libs/app-runtime/docs/data/cold-db-activation-and-invite-recovery.md.
 */
export interface InvitedCloudRegistryEntry {
    cloudId: string;
    name?: string;
}

interface CloudCore {
    saveDelegationToken: (token: CloudDelegationTokenView) => void;
    getDelegationToken: () => CloudDelegationTokenView | null;
    saveCloudToken: (token: UserTokenView) => void;
    getCloudToken: () => UserTokenView | null;
    /** Cached tokens for `cloudId` when still valid (credential not within the expiry margin), else null. */
    getCachedCloudTokens: (cloudId: string) => CachedCloudTokens | null;
    setCachedCloudTokens: (cloudId: string, tokens: CachedCloudTokens) => void;
    saveSelectedCloudId: (cloudId: string) => void;
    getSelectedCloudId: () => string | null;
    saveSelectedSiteId: (siteId: string) => void;
    getSelectedSiteId: () => string | null;
    clearSelectedSite: () => void;
    clearSelectedPlace: () => void;
    getSelectedPlaceId: () => string | null;
    clearDelegationToken: () => void;
    clearSession: () => void;
    getBackend: () => string | null;
    getWss: () => string | null;
    getIdentityToken: () => string | null;
    getCredential: () => AWSCredentials | null;
    savePlaceOrder: (cloudId: string, order: string[]) => void;
    getPlaceOrder: (cloudId: string) => string[] | null;
    clearPlaceOrder: (cloudId: string) => void;
    getInvitedCloudRegistry: () => InvitedCloudRegistryEntry[];
    /** Insert or update a registry entry by cloudId (name is overwritten when provided). */
    upsertInvitedCloud: (entry: InvitedCloudRegistryEntry) => void;
    removeInvitedCloud: (cloudId: string) => void;
}

export const cloudCore: CloudCore = {
    saveDelegationToken: (token: CloudDelegationTokenView): void => {
        storage.set(CLOUD_DELEGATION_TOKEN_KEY, JSON.stringify(token));
        notifySessionStateChanged();
    },

    getDelegationToken: (): CloudDelegationTokenView | null => {
        const raw = storage.get(CLOUD_DELEGATION_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as CloudDelegationTokenView) : null;
    },

    saveCloudToken: (token: UserTokenView): void => {
        storage.set(CLOUD_TOKEN_KEY, JSON.stringify(token));
        notifySessionStateChanged();
    },

    getCloudToken: (): UserTokenView | null => {
        const raw = storage.get(CLOUD_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as UserTokenView) : null;
    },

    getCachedCloudTokens: (cloudId: string): CachedCloudTokens | null => {
        const raw = storage.get(CLOUD_TOKEN_CACHE_KEY);
        if (!raw) return null;
        const map = JSON.parse(raw) as Record<string, CachedCloudTokens>;
        const entry = map[cloudId];
        if (!entry) return null;

        // Valid only while the cloud token's AWS credential is still comfortably in-date.
        const expiration = entry.cloudToken?.Token?.credential?.Expiration;
        const expiresAt = expiration ? new Date(expiration as unknown as string).getTime() : 0;
        if (!expiresAt || Date.now() >= expiresAt - CLOUD_TOKEN_CACHE_MARGIN_MS) {
            delete map[cloudId];
            storage.set(CLOUD_TOKEN_CACHE_KEY, JSON.stringify(map));
            return null;
        }
        return entry;
    },

    setCachedCloudTokens: (cloudId: string, tokens: CachedCloudTokens): void => {
        const raw = storage.get(CLOUD_TOKEN_CACHE_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, CachedCloudTokens>) : {};
        map[cloudId] = tokens;
        storage.set(CLOUD_TOKEN_CACHE_KEY, JSON.stringify(map));
    },

    saveSelectedCloudId: (cloudId: string): void => {
        storage.set(CLOUD_SELECTED_CLOUD_KEY, cloudId);
        notifySessionStateChanged();
    },

    getSelectedCloudId: (): string | null => {
        return storage.get(CLOUD_SELECTED_CLOUD_KEY);
    },

    saveSelectedSiteId: (siteId: string): void => {
        storage.set(CLOUD_SELECTED_PLACE_KEY, siteId);
        notifySessionStateChanged();
    },

    getSelectedSiteId: (): string | null => {
        return storage.get(CLOUD_SELECTED_PLACE_KEY);
    },

    clearSelectedSite: (): void => {
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        notifySessionStateChanged();
    },

    clearSelectedPlace: (): void => {
        cloudCore.clearSelectedSite();
    },

    getSelectedPlaceId: (): string | null => {
        return cloudCore.getSelectedSiteId();
    },

    savePlaceOrder: (cloudId: string, order: string[]): void => {
        storage.set(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`, JSON.stringify(order));
    },

    getPlaceOrder: (cloudId: string): string[] | null => {
        const raw = storage.get(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`);
        return raw ? (JSON.parse(raw) as string[]) : null;
    },

    clearPlaceOrder: (cloudId: string): void => {
        storage.remove(`${CLOUD_PLACE_ORDER_KEY_PREFIX}${cloudId}`);
        notifySessionStateChanged();
    },

    getInvitedCloudRegistry: (): InvitedCloudRegistryEntry[] => {
        const raw = storage.get(CLOUD_INVITED_BUNDLES_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw) as InvitedCloudRegistryEntry[];
            return Array.isArray(parsed) ? parsed.filter(e => !!e?.cloudId) : [];
        } catch {
            return [];
        }
    },

    upsertInvitedCloud: (entry: InvitedCloudRegistryEntry): void => {
        if (!entry?.cloudId) return;
        const list = cloudCore.getInvitedCloudRegistry();
        const idx = list.findIndex(e => e.cloudId === entry.cloudId);
        if (idx >= 0) {
            list[idx] = { ...list[idx], ...entry };
        } else {
            list.push({ cloudId: entry.cloudId, name: entry.name });
        }
        storage.set(CLOUD_INVITED_BUNDLES_KEY, JSON.stringify(list));
    },

    removeInvitedCloud: (cloudId: string): void => {
        const list = cloudCore.getInvitedCloudRegistry().filter(e => e.cloudId !== cloudId);
        storage.set(CLOUD_INVITED_BUNDLES_KEY, JSON.stringify(list));
    },

    clearDelegationToken: (): void => {
        storage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        storage.remove(CLOUD_TOKEN_KEY);
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        storage.set(CLOUD_SELECTED_CLOUD_KEY, 'default');
        notifySessionStateChanged();
    },

    clearSession: (): void => {
        storage.remove(CLOUD_DELEGATION_TOKEN_KEY);
        storage.remove(CLOUD_TOKEN_KEY);
        storage.remove(CLOUD_SELECTED_CLOUD_KEY);
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        storage.remove(CLOUD_INVITED_BUNDLES_KEY);
        storage.remove(CLOUD_TOKEN_CACHE_KEY);
        notifySessionStateChanged();
    },

    getBackend: (): string | null => {
        return cloudCore.getDelegationToken()?.backend ?? null;
    },

    getWss: (): string | null => {
        return cloudCore.getDelegationToken()?.wss ?? null;
    },

    getIdentityToken: (): string | null => {
        return cloudCore.getCloudToken()?.Token?.identityToken ?? null;
    },

    getCredential: (): AWSCredentials | null => {
        const token = cloudCore.getCloudToken();
        return (token?.Token?.credential as AWSCredentials) ?? null;
    },
};

// Standalone re-exports of the invited-cloud registry ops, so consumers (app-runtime boot
// recovery, apps/web invite-accept) can reach them without depending on the whole cloudCore object.
export const getInvitedCloudRegistry = (): InvitedCloudRegistryEntry[] => cloudCore.getInvitedCloudRegistry();
export const upsertInvitedCloud = (entry: InvitedCloudRegistryEntry): void => cloudCore.upsertInvitedCloud(entry);
export const removeInvitedCloud = (cloudId: string): void => cloudCore.removeInvitedCloud(cloudId);
