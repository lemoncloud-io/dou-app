import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { storage } from '@chatic/shared';
import { notifySessionStateChanged } from './signal';

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
}

export const cloudStore: CloudCore = {
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
        cloudStore.clearSelectedSite();
    },

    getSelectedPlaceId: (): string | null => {
        return cloudStore.getSelectedSiteId();
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
        return cloudStore.getDelegationToken()?.backend ?? null;
    },

    getWss: (): string | null => {
        return cloudStore.getDelegationToken()?.wss ?? null;
    },

    getIdentityToken: (): string | null => {
        return cloudStore.getCloudToken()?.Token?.identityToken ?? null;
    },

    getCredential: (): AWSCredentials | null => {
        const token = cloudStore.getCloudToken();
        return (token?.Token?.credential as AWSCredentials) ?? null;
    },
};
