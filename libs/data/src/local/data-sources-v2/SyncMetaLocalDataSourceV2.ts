import type { CacheMetaView } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import { logger, type ObservationData } from '@chatic/bridges';
import type { CacheStorage } from '../ports';
import { resolveTtlMs } from '../ports/policy';
import { BaseLocalDataSourceV2 } from './types';

export interface ISyncMetaLocalDataSourceV2 {
    getSyncedAt(kind: string): Promise<number>;
    setSyncedAt(kind: string, syncedAt: number): Promise<void>;
}

/**
 * Persists sync cursors (e.g. the `channel.sync` `since` value) in the cid/uid-scoped
 * `meta` cache. `kind` is the metadata id (e.g. 'channel-sync'); absence reads as 0,
 * which callers treat as "sync everything".
 *
 * Two things can retire a cursor, and both land on the same safe answer — 0, a full re-sync:
 *
 * 1. **Age.** Cursors carry the meta TTL: a cursor idle beyond the TTL may point past the server's
 *    delta-history window, so an expired cursor reads as 0. Every successful sync re-saves the
 *    cursor, refreshing its TTL.
 * 2. **Storage routing (ADR-0053).** A cursor is a statement about data living in ANOTHER domain's
 *    store. If that domain moves stores, the cursor survives while the data does not follow, so it
 *    would claim "already synced up to T" over an empty store and only deltas after T would arrive.
 *    Stamping the cursor with the routing in force when it was written turns that into a mismatch.
 */
export class SyncMetaLocalDataSourceV2 extends BaseLocalDataSourceV2 implements ISyncMetaLocalDataSourceV2 {
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
        private readonly cacheStorage: CacheStorage<'meta'>,
        private readonly routingFingerprint?: string
    ) {
        super(contextProvider);
    }

    public async getSyncedAt(kind: string): Promise<number> {
        const row = await this.cacheStorage.load(kind);
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
        return row.syncedAt ?? 0;
    }

    /**
     * Records that a cursor was thrown away, and why.
     *
     * Retiring a cursor is correct in both cases, but it is never free: the next sync runs with
     * `since = 0` and pulls the domain in full, which is a request burst on the server and a slow
     * first screen on the client. Silently returning 0 made that burst unattributable — and a
     * routing fingerprint that changes on every boot (a real failure mode, not a hypothesis) would
     * charge it forever with nothing to point at (ADR-0075).
     *
     * A missing row is deliberately NOT reported: that is a first sync, the ordinary cold path.
     */
    private reportRetired(cursorKind: string, reason: 'routing-changed' | 'expired'): void {
        // `cursorKind`, not `kind`: this value names WHICH cursor (`channel-sync:<cid>`), and a bare
        // `kind` collided with the divergence entries' discriminator, where it named which
        // comparison. The discriminator is now `observation` for every structured entry.
        logger.warn('SYNC', `sync cursor retired (${reason}) — full re-sync follows`, {
            observation: 'sync-cursor-retired',
            cursorKind,
            reason,
        } satisfies ObservationData);
    }

    public async setSyncedAt(kind: string, syncedAt: number): Promise<void> {
        const view: CacheMetaView = {
            id: kind,
            cid: this.getCid(),
            uid: this.getUid(),
            syncedAt,
            ...(this.routingFingerprint ? { routing: this.routingFingerprint } : {}),
        };
        await this.cacheStorage.save(kind, view);
    }
}
