import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { AWSCredentials } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import { storage } from '@chatic/shared';
import { msUntilExpiration } from './expiry';
import { JsonSlot, type StorageLike } from './jsonSlot';
import { sessionSignal, type ISessionSignal } from './signal';

const CLOUD_DELEGATION_TOKEN_KEY = 'chatic-cloud-delegation-token';
const CLOUD_TOKEN_KEY = 'chatic-cloud-token';
const CLOUD_SELECTED_CLOUD_KEY = 'chatic-selected-cloud-id';
const CLOUD_SELECTED_PLACE_KEY = 'chatic-selected-place-id';
const CLOUD_INVITED_BUNDLES_KEY = 'chatic-invited-clouds';
// Per-cloud token cache: lets a re-switch to a recently-visited cloud reuse its delegation + cloud
// token instead of re-issuing them over 2 HTTP round trips, so the cloud identity (uid) — and thus
// the cid+uid-scoped local cache — is available instantly on switch.
const CLOUD_TOKEN_CACHE_KEY = 'chatic-cloud-token-cache';
// Skip a cached cloud token whose AWS credential expires within this margin — the fresh token is
// re-issued instead so the socket never connects with a credential about to lapse.
const CLOUD_TOKEN_CACHE_MARGIN_MS = 60_000;

/** A cloud's delegation + user token, cached by cloudId for fast re-switch. */
export interface CachedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

/**
 * The cloud slot of the session store. Renamed off `CloudCore` — that name came from web-core's
 * `session/core` folder and sat outside this repo's `I*` contract convention (ADR-0076 결정 0).
 */
export interface ICloudStore {
    saveDelegationToken(token: CloudDelegationTokenView): void;
    getDelegationToken(): CloudDelegationTokenView | null;
    saveCloudToken(token: UserTokenView): void;
    getCloudToken(): UserTokenView | null;
    /** Cached tokens for `cloudId` when still valid (credential not within the expiry margin), else null. */
    getCachedCloudTokens(cloudId: string): CachedCloudTokens | null;
    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void;
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

    constructor(
        private readonly storage: StorageLike,
        private readonly signal: ISessionSignal
    ) {
        this.delegation = new JsonSlot(storage, CLOUD_DELEGATION_TOKEN_KEY);
        this.token = new JsonSlot(storage, CLOUD_TOKEN_KEY);
        this.cache = new JsonSlot(storage, CLOUD_TOKEN_CACHE_KEY);
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

        // Valid only while the cloud token's AWS credential is still comfortably in-date.
        const remaining = msUntilExpiration(entry.cloudToken?.Token?.credential?.Expiration, Date.now());
        if (remaining == null || remaining <= CLOUD_TOKEN_CACHE_MARGIN_MS) {
            delete map[cloudId];
            this.cache.write(map);
            return null;
        }
        return entry;
    }

    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void {
        // No signal: this is a pure cache write, not session state. The kinds regulation
        // (ADR-0076 결정 2) names this the one legitimate exception, and the name says so.
        const map = this.cache.read() ?? {};
        map[cloudId] = tokens;
        this.cache.write(map);
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
        // Tokens AND selection go together, so both kinds are announced inside one batch — leaving
        // the cloud is one observable change, not two.
        this.signal.batch(() => {
            this.delegation.clear();
            this.token.clear();
            this.storage.remove(CLOUD_SELECTED_CLOUD_KEY);
            this.storage.remove(CLOUD_SELECTED_PLACE_KEY);
            this.storage.remove(CLOUD_INVITED_BUNDLES_KEY);
            this.cache.clear();
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

export const cloudStore: ICloudStore = new CloudStore(storage, sessionSignal);
