import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { storage } from '@chatic/shared';
import { msUntilExpiration } from './expiry';
import { sessionSignal } from './signal';

export const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
export const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
export const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
export const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';
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
    clearSession: () => void;
    getBackend: () => string | null;
    getWss: () => string | null;
    getIdentityToken: () => string | null;
    getCredential: () => AWSCredentials | null;
}

export const cloudStore: CloudCore = {
    saveDelegationToken: (token: CloudDelegationTokenView): void => {
        storage.set(CLOUD_DELEGATION_TOKEN_KEY, JSON.stringify(token));
        sessionSignal.emit('cloud:token');
    },

    getDelegationToken: (): CloudDelegationTokenView | null => {
        const raw = storage.get(CLOUD_DELEGATION_TOKEN_KEY);
        return raw ? (JSON.parse(raw) as CloudDelegationTokenView) : null;
    },

    saveCloudToken: (token: UserTokenView): void => {
        storage.set(CLOUD_TOKEN_KEY, JSON.stringify(token));
        sessionSignal.emit('cloud:token');
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
        const remaining = msUntilExpiration(entry.cloudToken?.Token?.credential?.Expiration, Date.now());
        if (remaining == null || remaining <= CLOUD_TOKEN_CACHE_MARGIN_MS) {
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
        sessionSignal.emit('selection');
    },

    getSelectedCloudId: (): string | null => {
        return storage.get(CLOUD_SELECTED_CLOUD_KEY);
    },

    saveSelectedSiteId: (siteId: string): void => {
        storage.set(CLOUD_SELECTED_PLACE_KEY, siteId);
        sessionSignal.emit('selection');
    },

    getSelectedSiteId: (): string | null => {
        return storage.get(CLOUD_SELECTED_PLACE_KEY);
    },

    clearSelectedSite: (): void => {
        storage.remove(CLOUD_SELECTED_PLACE_KEY);
        sessionSignal.emit('selection');
    },

    clearSession: (): void => {
        // Tokens AND selection go together, so both kinds are announced inside one batch — leaving
        // the cloud is one observable change, not two.
        sessionSignal.batch(() => {
            storage.remove(CLOUD_DELEGATION_TOKEN_KEY);
            storage.remove(CLOUD_TOKEN_KEY);
            storage.remove(CLOUD_SELECTED_CLOUD_KEY);
            storage.remove(CLOUD_SELECTED_PLACE_KEY);
            storage.remove(CLOUD_INVITED_BUNDLES_KEY);
            storage.remove(CLOUD_TOKEN_CACHE_KEY);
            sessionSignal.emit('cloud:token');
            sessionSignal.emit('selection');
        });
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
