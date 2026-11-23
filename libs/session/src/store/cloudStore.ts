import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { msUntilTokenExpiry } from './expiry';
import { JsonSlot } from './jsonSlot';
import { plainPort, secretPort, type StoragePortPair } from './ports';
import { sessionSignal, type ISessionSignal } from './signal';

const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';
const CLOUD_TOKEN_CACHE_KEY = 'chatic-cloud-token-cache';
const CLOUD_TOKEN_CACHE_MARGIN_MS = 60_000;
const CLOUD_IDENTITIES_KEY = 'chatic-cloud-identities';
const CLOUD_RECENT_KEY = 'chatic-recent-clouds';
const CLOUD_RECENT_LIMIT = 20;
const CLOUD_RECLAIMED_KEY = 'chatic-reclaimed-clouds';

export interface CachedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

export interface CloudIdentity {
    uid: string;
}

export interface ICloudStore {
    saveDelegationToken(token: CloudDelegationTokenView): void;
    getDelegationToken(): CloudDelegationTokenView | null;
    saveCloudToken(token: UserTokenView): void;
    getCloudToken(): UserTokenView | null;
    getCachedCloudTokens(cloudId: string): CachedCloudTokens | null;
    peekCachedCloudTokens(cloudId: string): CachedCloudTokens | null;
    getCachedCloudIds(): string[];
    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void;
    dropCachedCloudTokens(cloudId: string): void;
    clearCachedCloudTokens(): void;
    getCloudTokenOf(cloudId: string): UserTokenView | null;
    getCloudIdentity(cloudId: string): CloudIdentity | null;
    setCloudIdentity(cloudId: string, identity: CloudIdentity): void;
    getCloudIdentities(): Record<string, CloudIdentity>;
    dropCloudIdentity(cloudId: string): void;
    clearCloudIdentities(): void;
    subscribeUidSources(listener: () => void): () => void;
    recordCloudUse(cloudId: string): void;
    getRecentClouds(): string[];
    clearRecentClouds(): void;
    getReclaimedFor(cloudId: string): string | null;
    setReclaimedFor(cloudId: string, relayUserId: string): void;
    clearReclaimedClouds(): void;
    saveSelectedCloudId(cloudId: string): void;
    getSelectedCloudId(): string | null;
    saveSelectedSiteId(siteId: string): void;
    getSelectedSiteId(): string | null;
    clearSelectedSite(): void;
    clearSession(): void;
    getBackend(): string | null;
    getWss(): string | null;
    getIdentityToken(): string | null;
    getCredential(): AWSCredentials | null;
}

class CloudStore implements ICloudStore {
    private readonly delegation: JsonSlot<CloudDelegationTokenView>;
    private readonly token: JsonSlot<UserTokenView>;
    private readonly cache: JsonSlot<Record<string, CachedCloudTokens>>;
    private readonly identities: JsonSlot<Record<string, CloudIdentity>>;
    private readonly recent: JsonSlot<string[]>;
    private readonly reclaimed: JsonSlot<Record<string, string>>;
    private readonly uidSourceListeners = new Set<() => void>();

    private readonly storage: StoragePortPair['plain'];

    constructor(
        ports: StoragePortPair,
        private readonly signal: ISessionSignal
    ) {
        this.storage = ports.plain;
        this.delegation = new JsonSlot(ports.secret, CLOUD_DELEGATION_TOKEN_KEY);
        this.token = new JsonSlot(ports.secret, CLOUD_TOKEN_KEY);
        this.cache = new JsonSlot(ports.secret, CLOUD_TOKEN_CACHE_KEY);
        this.identities = new JsonSlot(ports.plain, CLOUD_IDENTITIES_KEY);
        this.recent = new JsonSlot(ports.plain, CLOUD_RECENT_KEY);
        this.reclaimed = new JsonSlot(ports.plain, CLOUD_RECLAIMED_KEY);
    }

    saveDelegationToken(token: CloudDelegationTokenView): void {
        this.delegation.write(token);
        this.signal.emit('cloud:token');
    }

    getDelegationToken(): CloudDelegationTokenView | null {
        return this.delegation.read();
    }

    saveCloudToken(token: UserTokenView): void {
        this.token.write(token);
        this.signal.emit('cloud:token');
    }

    getCloudToken(): UserTokenView | null {
        return this.token.read();
    }

    getCachedCloudTokens(cloudId: string): CachedCloudTokens | null {
        const map = this.cache.read();
        const entry = map?.[cloudId];
        if (!map || !entry) return null;

        const remaining = msUntilTokenExpiry(entry.cloudToken?.Token?.identityToken, Date.now());
        if (remaining != null && remaining <= CLOUD_TOKEN_CACHE_MARGIN_MS) {
            delete map[cloudId];
            this.cache.write(map);
            return null;
        }
        return entry;
    }

    peekCachedCloudTokens(cloudId: string): CachedCloudTokens | null {
        return this.cache.read()?.[cloudId] ?? null;
    }

    getCachedCloudIds(): string[] {
        return Object.keys(this.cache.read() ?? {});
    }

    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void {
        const map = this.cache.read() ?? {};
        map[cloudId] = tokens;
        this.cache.write(map);
        this.uidSourcesChanged();
    }

    dropCachedCloudTokens(cloudId: string): void {
        const map = this.cache.read();
        if (!map || !(cloudId in map)) return;
        delete map[cloudId];
        this.cache.write(map);
        this.uidSourcesChanged();
    }

    clearCachedCloudTokens(): void {
        this.cache.clear();
        this.uidSourcesChanged();
    }

    getCloudTokenOf(cloudId: string): UserTokenView | null {
        if (this.getDelegationToken()?.cloudId === cloudId) return this.getCloudToken();
        return this.peekCachedCloudTokens(cloudId)?.cloudToken ?? null;
    }

    getCloudIdentity(cloudId: string): CloudIdentity | null {
        return this.identities.read()?.[cloudId] ?? null;
    }

    setCloudIdentity(cloudId: string, identity: CloudIdentity): void {
        const map = this.identities.read() ?? {};
        if (map[cloudId]?.uid === identity.uid) return;
        map[cloudId] = identity;
        this.identities.write(map);
        this.uidSourcesChanged();
    }

    getCloudIdentities(): Record<string, CloudIdentity> {
        return { ...(this.identities.read() ?? {}) };
    }

    dropCloudIdentity(cloudId: string): void {
        const map = this.identities.read();
        if (!map || !(cloudId in map)) return;
        delete map[cloudId];
        this.identities.write(map);
        this.uidSourcesChanged();
    }

    clearCloudIdentities(): void {
        this.identities.clear();
        this.uidSourcesChanged();
    }

    subscribeUidSources(listener: () => void): () => void {
        this.uidSourceListeners.add(listener);
        return () => {
            this.uidSourceListeners.delete(listener);
        };
    }

    private uidSourcesChanged(): void {
        for (const listener of [...this.uidSourceListeners]) listener();
    }

    recordCloudUse(cloudId: string): void {
        const current = this.recent.read() ?? [];
        if (current[0] === cloudId) return;
        this.recent.write([cloudId, ...current.filter(id => id !== cloudId)].slice(0, CLOUD_RECENT_LIMIT));
    }

    getRecentClouds(): string[] {
        return [...(this.recent.read() ?? [])];
    }

    clearRecentClouds(): void {
        this.recent.clear();
    }

    getReclaimedFor(cloudId: string): string | null {
        return this.reclaimed.read()?.[cloudId] ?? null;
    }

    setReclaimedFor(cloudId: string, relayUserId: string): void {
        const map = this.reclaimed.read() ?? {};
        if (map[cloudId] === relayUserId) return;
        this.reclaimed.write({ ...map, [cloudId]: relayUserId });
    }

    clearReclaimedClouds(): void {
        this.reclaimed.clear();
    }

    saveSelectedCloudId(cloudId: string): void {
        this.storage.set(CLOUD_SELECTED_CLOUD_KEY, cloudId);
        this.signal.emit('selection');
    }

    getSelectedCloudId(): string | null {
        return this.storage.get(CLOUD_SELECTED_CLOUD_KEY);
    }

    saveSelectedSiteId(siteId: string): void {
        this.storage.set(CLOUD_SELECTED_PLACE_KEY, siteId);
        this.signal.emit('selection');
    }

    getSelectedSiteId(): string | null {
        return this.storage.get(CLOUD_SELECTED_PLACE_KEY);
    }

    clearSelectedSite(): void {
        this.storage.remove(CLOUD_SELECTED_PLACE_KEY);
        this.signal.emit('selection');
    }

    clearSession(): void {
        this.signal.batch(() => {
            this.delegation.clear();
            this.token.clear();
            this.storage.remove(CLOUD_SELECTED_CLOUD_KEY);
            this.storage.remove(CLOUD_SELECTED_PLACE_KEY);
            this.signal.emit('cloud:token');
            this.signal.emit('selection');
        });
    }

    getBackend(): string | null {
        return this.getDelegationToken()?.backend ?? null;
    }

    getWss(): string | null {
        return this.getDelegationToken()?.wss ?? null;
    }

    getIdentityToken(): string | null {
        return this.getCloudToken()?.Token?.identityToken ?? null;
    }

    getCredential(): AWSCredentials | null {
        return (this.getCloudToken()?.Token?.credential as AWSCredentials) ?? null;
    }
}

export const cloudStore: ICloudStore = new CloudStore({ secret: secretPort, plain: plainPort }, sessionSignal);
