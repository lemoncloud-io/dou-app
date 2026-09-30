import type { CacheMetaView } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories/types';
import type { LocalDataSourceContextOverride } from './types';
import { logger, type ObservationData } from '@chatic/bridges';
import type { ScopedCacheStorage } from '../ports';
import { resolveTtlMs } from '../ports/policy';
import { BaseLocalDataSource } from './types';

export interface ISyncMetaLocalDataSource {
    getSyncedAt(kind: string, contextOverride?: LocalDataSourceContextOverride): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /**
     * Drops every cursor in the partition. Whoever clears the data a cursor describes has to clear
     * the cursor with it: a surviving cursor still claims "synced up to T" over an empty store, so the
     * next sync asks only for the delta after T and the gap never fills.
     */
    cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/**
 * Persists sync cursors (e.g. the `channel.sync` `since` value) in the cid/uid-scoped
 * `meta` cache. `kind` is the metadata id (e.g. 'channel-sync'); absence reads as 0,
 * which callers treat as "sync everything".
 *
 * Three things can retire a cursor, and all land on the same safe answer — 0, a full re-sync:
 *
 * 1. **Age.** Cursors carry the meta TTL: a cursor idle beyond the TTL may point past the server's
 *    delta-history window, so an expired cursor reads as 0. Every successful sync re-saves the
 *    cursor, refreshing its TTL.
 * 2. **Storage routing (ADR-0053).** A cursor is a statement about data living in ANOTHER domain's
 *    store. If that domain moves stores, the cursor survives while the data does not follow, so it
 *    would claim "already synced up to T" over an empty store and only deltas after T would arrive.
 *    Stamping the cursor with the routing in force when it was written turns that into a mismatch.
 * 3. **A cache clear.** Clearing the data a cursor describes leaves the same lie behind, and a sync
 *    that was already in flight can write a fresh cursor after the clear removed the old ones. A
 *    cursor saved before `cursorsValidAfter()` is therefore not trusted — whoever cleared the cache
 *    moves that instant forward, and every cursor from before it goes.
 */
export class SyncMetaLocalDataSource extends BaseLocalDataSource<'meta'> implements ISyncMetaLocalDataSource {
    /**
     * @param routingFingerprint Identifies the storage routing these cursors were written under.
     *   Deliberately covers EVERY cache type rather than just the domains that have cursors: the
     *   `kind` strings are assembled by callers (`channel-sync:${cid}`), so any kind→domain table
     *   here would silently miss a cursor added later. The cost is over-invalidation — a routing
     *   change for an unrelated domain also retires these cursors — which buys one full re-sync,
     *   the same price the TTL above already charges routinely. Omitted (tests, injected storage
     *   factories) disables the check entirely.
     */
    constructor(
        contextProvider: DataContextProvider,
        storages: ScopedCacheStorage<'meta'>,
        private readonly routingFingerprint?: string,
        /**
         * The instant before which no cursor is trusted, read on every call. Omitted, or 0, means
         * every cursor is (subject to the two checks above).
         */
        private readonly cursorsValidAfter?: () => number
    ) {
        super(contextProvider, storages);
    }

    public async getSyncedAt(kind: string, contextOverride?: LocalDataSourceContextOverride): Promise<number> {
        const row = await this.storage(contextOverride).load(kind);
        // No row at all is a first sync, not a retirement — the common cold-start path stays silent.
        if (!row) return 0;
        // A cursor written before this stamp existed has no `routing` and cannot be shown to
        // describe the current one, so it retires too — one extra full re-sync, once.
        if (this.routingFingerprint && row.routing !== this.routingFingerprint) {
            this.reportRetired(kind, 'routing-changed');
            return 0;
        }
        // Expiry is computed at read time from lastSyncedAt (the local save time) instead of
        // the stored expiresAt: rows written under the old "never expire" policy carry a
        // far-future expiresAt, and read-time computation applies the current TTL retroactively.
        // Rows without cache meta (e.g. legacy adapters) are treated as expired — the safe
        // fallback is a one-time full re-sync.
        const savedAt = row.__cacheMeta?.lastSyncedAt;
        if (!savedAt || savedAt + resolveTtlMs('meta') <= Date.now()) {
            this.reportRetired(kind, 'expired');
            return 0;
        }
        if (this.cursorsValidAfter && savedAt < this.cursorsValidAfter()) {
            this.reportRetired(kind, 'cache-cleared');
            return 0;
        }
        return row.syncedAt ?? 0;
    }

    /**
     * Records that a cursor was thrown away, and why.
     *
     * Retiring a cursor is correct in both cases, but it is never free: the next sync runs with
     * `since = 0` and pulls the domain in full, which is a request burst on the server and a slow
     * first screen on the client. Silently returning 0 made that burst unattributable — and a
     * routing fingerprint that changes on every boot (a real failure mode, not a hypothesis) would
     * charge it forever with nothing to point at (ADR-0099).
     *
     * A missing row is deliberately NOT reported: that is a first sync, the ordinary cold path.
     */
    private reportRetired(cursorKind: string, reason: 'routing-changed' | 'expired' | 'cache-cleared'): void {
        // `cursorKind`, not `kind`: this value names WHICH cursor (`channel-sync:<cid>`), and a bare
        // `kind` collided with the divergence entries' discriminator, where it named which
        // comparison. The discriminator is now `observation` for every structured entry.
        logger.warn('SYNC', `sync cursor retired (${reason}) — full re-sync follows`, {
            observation: 'sync-cursor-retired',
            cursorKind,
            reason,
        } satisfies ObservationData);
    }

    public async setSyncedAt(
        kind: string,
        syncedAt: number,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        // One context for the row's stamp and the partition it is saved in.
        const context = this.resolveContext(contextOverride);
        const view: CacheMetaView = {
            id: kind,
            cid: this.getCid(context),
            uid: this.getUid(context),
            syncedAt,
            ...(this.routingFingerprint ? { routing: this.routingFingerprint } : {}),
        };
        await this.storage(context).save(kind, view);
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
    }
}
