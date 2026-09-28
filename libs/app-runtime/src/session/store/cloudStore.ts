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
// Which uid this account has in each cloud, kept past the token that carried it. A cloud token
// expires within about an hour, but the cid+uid the local cache partitions under does not change
// with the token — so a reader that wants another cloud's partition (its unread count, its sync
// cursor) needs the uid without needing a live token. Recorded whenever a cloud token is issued or
// written back; cleared only with the whole session, because a different account has different uids.
const CLOUD_IDENTITIES_KEY = 'chatic-cloud-identities';
// The clouds this account has entered, most recent first. It orders which clouds keep a background
// socket session when there are more of them than the cap allows, so it has to survive a reload —
// and it is account state, cleared with the identities above.
const CLOUD_RECENT_KEY = 'chatic-recent-clouds';
// Long enough to cover every cloud that could plausibly hold a background slot, several times over.
const CLOUD_RECENT_LIMIT = 20;

/** A cloud's delegation + user token, cached by cloudId for fast re-switch. */
export interface CachedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

/** What this account is inside one cloud — the half of the cache key that outlives the token. */
export interface CloudIdentity {
    uid: string;
}

/**
 * The cloud slot of the session store. Renamed off `CloudCore` — that name came from web-core's
 * `session/core` folder and sat outside this repo's `I*` contract convention (ADR-0076 Decision 0).
 */
export interface ICloudStore {
    saveDelegationToken(token: CloudDelegationTokenView): void;
    getDelegationToken(): CloudDelegationTokenView | null;
    saveCloudToken(token: UserTokenView): void;
    getCloudToken(): UserTokenView | null;
    /** Cached tokens for `cloudId` when still valid (credential not within the expiry margin), else null. */
    getCachedCloudTokens(cloudId: string): CachedCloudTokens | null;
    /**
     * Cached tokens for `cloudId` exactly as stored — no expiry margin, nothing dropped. For signing:
     * a socket that registered with this token keeps signing with it until it is renewed, and a
     * margin-checked read that deleted the entry would leave that socket with nothing to sign from.
     */
    peekCachedCloudTokens(cloudId: string): CachedCloudTokens | null;
    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void;
    /** Forgets one cloud's cached tokens. The other clouds' entries, and the identities, stay. */
    dropCachedCloudTokens(cloudId: string): void;
    /** Forgets every cloud's cached tokens — the account is ending, not one cloud. */
    clearCachedCloudTokens(): void;
    /**
     * The token the socket serving `cloudId` authenticates with: the store's own token while that cloud
     * is the committed one, otherwise the cached copy (margin-blind). Null when neither exists.
     */
    getCloudTokenOf(cloudId: string): UserTokenView | null;
    getCloudIdentity(cloudId: string): CloudIdentity | null;
    setCloudIdentity(cloudId: string, identity: CloudIdentity): void;
    /** Every recorded cloud identity, keyed by cloud id. */
    getCloudIdentities(): Record<string, CloudIdentity>;
    /** Forgets every cloud identity — the account is changing, and its uids change with it. */
    clearCloudIdentities(): void;
    /** Moves `cloudId` to the front of the recently entered clouds. */
    recordCloudUse(cloudId: string): void;
    /** The clouds this account has entered, most recent first. */
    getRecentClouds(): string[];
    /** Forgets the recently entered clouds — account state, like the identities. */
    clearRecentClouds(): void;
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

    constructor(
        private readonly storage: StorageLike,
        private readonly signal: ISessionSignal
    ) {
        this.delegation = new JsonSlot(storage, CLOUD_DELEGATION_TOKEN_KEY);
        this.token = new JsonSlot(storage, CLOUD_TOKEN_KEY);
        this.cache = new JsonSlot(storage, CLOUD_TOKEN_CACHE_KEY);
        this.identities = new JsonSlot(storage, CLOUD_IDENTITIES_KEY);
        this.recent = new JsonSlot(storage, CLOUD_RECENT_KEY);
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

    peekCachedCloudTokens(cloudId: string): CachedCloudTokens | null {
        return this.cache.read()?.[cloudId] ?? null;
    }

    setCachedCloudTokens(cloudId: string, tokens: CachedCloudTokens): void {
        // No signal: this is a pure cache write, not session state. The kinds regulation
        // (ADR-0076 Decision 2) names this the one legitimate exception, and the name says so.
        const map = this.cache.read() ?? {};
        map[cloudId] = tokens;
        this.cache.write(map);
    }

    dropCachedCloudTokens(cloudId: string): void {
        // No signal, for the same reason as `setCachedCloudTokens`.
        const map = this.cache.read();
        if (!map || !(cloudId in map)) return;
        delete map[cloudId];
        this.cache.write(map);
    }

    clearCachedCloudTokens(): void {
        // No signal, for the same reason as `setCachedCloudTokens`.
        this.cache.clear();
    }

    getCloudTokenOf(cloudId: string): UserTokenView | null {
        // The committed cloud's token is the store's own, not the cache's copy: the two are written
        // level on every commit and writeback, but the store is the one the session derives from.
        if (this.getDelegationToken()?.cloudId === cloudId) return this.getCloudToken();
        return this.peekCachedCloudTokens(cloudId)?.cloudToken ?? null;
    }

    getCloudIdentity(cloudId: string): CloudIdentity | null {
        return this.identities.read()?.[cloudId] ?? null;
    }

    setCloudIdentity(cloudId: string, identity: CloudIdentity): void {
        // No signal: nothing derives from this map yet, and a uid moves only with a new account,
        // which announces itself through the relay token.
        const map = this.identities.read() ?? {};
        if (map[cloudId]?.uid === identity.uid) return;
        map[cloudId] = identity;
        this.identities.write(map);
    }

    getCloudIdentities(): Record<string, CloudIdentity> {
        // A copy: the slot memoises the parsed object, and a caller mutating it would corrupt what
        // the next read (and `setCloudIdentity`'s no-op guard) sees.
        return { ...(this.identities.read() ?? {}) };
    }

    clearCloudIdentities(): void {
        this.identities.clear();
    }

    recordCloudUse(cloudId: string): void {
        // No signal: this is written inside the commit batch of a switch, which already announces the
        // change every reader of this list re-derives on.
        const current = this.recent.read() ?? [];
        if (current[0] === cloudId) return;
        this.recent.write([cloudId, ...current.filter(id => id !== cloudId)].slice(0, CLOUD_RECENT_LIMIT));
    }

    getRecentClouds(): string[] {
        // A copy, for the same reason as `getCloudIdentities`.
        return [...(this.recent.read() ?? [])];
    }

    clearRecentClouds(): void {
        this.recent.clear();
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
            // The per-cloud token cache stays, and so do the identities: leaving the committed cloud
            // does not end this account's session in any other cloud. Those clouds keep background
            // socket sessions that sign from the cache, and the one just left usually becomes one of
            // them. `clearCachedCloudTokens` and `clearCloudIdentities` are the account-level
            // teardown's calls.
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
