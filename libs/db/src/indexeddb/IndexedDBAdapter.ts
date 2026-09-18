import type { CacheChatView, CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { AdapterScope, DataContextProvider, IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '@chatic/data';
import { createTtlMeta, withCacheMeta } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { BaseDbAdapter } from '../base/BaseDbAdapter';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

/**
 * Did the browser refuse the write because storage quota was exceeded?
 *
 * Kept in one place — this predicate is bound to grow over time (Safari's legacy
 * `QUOTA_EXCEEDED_ERR`, `code === 22`, wrapped errors), and a duplicated copy would only get
 * updated on one side, leaving the other silently narrow. Since `IndexedDBAdapter` is the only
 * consumer (moved here per ADR-0070 decision 5), it lives alongside it — leaving a web-only
 * predicate in `@chatic/data` would tie that lib to a DOM type (`DOMException`).
 */
export const isQuotaExceededError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'QuotaExceededError';

/**
 * The lower bound of what's eligible for eviction. An unsent row (`UNSENT_CHAT_NO` — sending or
 * failed) merely lacks a server number yet, it isn't old, and `useChats` always displays it
 * sorted as "most recent", so it's always kept out of range.
 */
const EVICTABLE_CHAT_NO_FLOOR = UNSENT_CHAT_NO + 1;

export interface IndexedDBAdapterOptions<TType extends CacheType> {
    /** Per-domain query delegate */
    executor?: IndexedDbQueryExecutor<TType>;
    /**
     * The retention cap per channel for the 'chat' cache. Unlimited (existing behavior) if
     * unspecified. When exceeded, the oldest messages (lowest chat_no) are removed first.
     */
    maxChatsPerChannel?: number;
}

/**
 * An individual cache storage adapter class that uses IndexedDB as its store.
 * Inherits scope-calculation and other capabilities from BaseDbAdapter, and splits
 * responsibilities by delegating to a per-domain query delegate (IndexedDbQueryExecutor).
 *
 * @template TType the cache domain type
 */
export class IndexedDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly db: IIndexedDB,
        type: TType,
        contextProvider: DataContextProvider,
        private readonly options: IndexedDBAdapterOptions<TType> = {}
    ) {
        super(type, contextProvider);
    }

    private buildKey(cid: string, uid: string, id: string): string {
        return `${this.type}:${cid}:${uid}:${id}`;
    }

    private createSchema(cid: string, uid: string, id: string, item: CacheModelOf<TType>): IndexedDbRow<TType> {
        const row: IndexedDbRow<TType> = {
            key: this.buildKey(cid, uid, id),
            type: this.type,
            cid,
            uid,
            id,
            data: withCacheMeta(this.type, item),
            meta: createTtlMeta(this.type),
        };

        if (this.type === 'chat') {
            const chatItem = item as unknown as CacheChatView;
            if (chatItem.channelId) {
                row.channel_id = chatItem.channelId;
            }
            if (chatItem.chatNo !== undefined) {
                row.chat_no = chatItem.chatNo;
            }
        }

        return row;
    }

    /**
     * The channels the cap should be applied to. Empty array if no cap is set or the type
     * isn't chat.
     *
     * Excludes a write that touched only unsent rows (`chat_no === UNSENT_CHAT_NO`) — the
     * eviction boundary is computed by looking only at `EVICTABLE_CHAT_NO_FLOOR` and above, so
     * such a write **can't change the answer.** Optimistic sends, failure re-marking, and
     * outbox retransmission all fall into this case, which cuts out nearly half the probes on
     * the sending path.
     */
    private cappedChannelIds(rows: IndexedDbRow<TType>[]): string[] {
        if (this.options.maxChatsPerChannel === undefined || this.type !== 'chat') return [];
        const evictable = rows.filter(row => (row.chat_no ?? UNSENT_CHAT_NO) >= EVICTABLE_CHAT_NO_FLOOR);
        return Array.from(new Set(evictable.map(row => row.channel_id).filter((id): id is string => !!id)));
    }

    /**
     * Attempts a single recovery from QuotaExceededError, but only when a cap is set.
     * With no cap (the default), the exception is rethrown as-is to keep existing behavior.
     */
    private async writeWithQuotaRecovery(
        write: () => Promise<void>,
        scope: AdapterScope,
        channelIds: string[]
    ): Promise<void> {
        try {
            await write();
        } catch (error) {
            if (!isQuotaExceededError(error)) throw error;
            if (channelIds.length === 0) {
                // Nothing cappable in this write, so there is no room to make. A client without a
                // channel cap has no safety net at all — the write is simply lost (ADR-0099).
                logger.error('CACHE', 'web cache quota exceeded with nothing to evict', { error });
                throw error;
            }
            await this.enforceChannelLimits(scope, channelIds);
            try {
                await write();
                // Recovered, and the user saw nothing — but older messages are gone. The retry's
                // outcome is half the information, so it rides on the same line.
                logger.warn('CACHE', 'web cache quota exceeded — evicted and retried, retry ok', {
                    data: { channels: channelIds.length },
                });
            } catch (retryError) {
                logger.error('CACHE', 'web cache quota exceeded — retry after eviction failed', {
                    error: retryError,
                    data: { channels: channelIds.length },
                });
                throw retryError;
            }
        }
    }

    private async enforceChannelLimits(scope: AdapterScope, channelIds: string[]): Promise<void> {
        const limit = this.options.maxChatsPerChannel;
        if (limit === undefined) return;
        for (const channelId of channelIds) {
            await this.evictChannelOverflow(scope, channelId, limit);
        }
    }

    /**
     * The first index key past the newest `limit` entries = the newest row that can't be kept
     * (the removal boundary). If there is none, the count is already within the cap, so nothing
     * happens.
     *
     * The key is that the boundary is captured as an **absolute key**. An approach of "count how
     * many are over, then read that many from the old end" would let a concurrent save that
     * removes older rows between the two lookups push the boundary upward, deleting messages
     * that are still visible. An absolute key keeps the meaning "at or below this key" fixed no
     * matter what happens in between (a concurrent removal only becomes a subset, and new
     * messages arriving land above the boundary and are unaffected).
     */
    private async evictChannelOverflow(scope: AdapterScope, channelId: string, limit: number): Promise<void> {
        const prefix = [this.type, scope.cid, scope.uid, channelId];
        const lower = [...prefix, EVICTABLE_CHAT_NO_FLOOR];

        const boundary = await this.db.findNewestKeyBeyond(
            CHAT_PAGINATION_INDEX,
            IDBKeyRange.bound(lower, [...prefix, []]),
            limit
        );
        if (boundary === null) return;

        const removed = await this.db.clearByRange(CHAT_PAGINATION_INDEX, IDBKeyRange.bound(lower, boundary));
        if (removed > 0) {
            // Named here rather than in `clearByRange`, which knows an index range and not which
            // channel it belongs to. "I scrolled up and the old messages are gone" has no other
            // explanation available (ADR-0099).
            logger.info('CACHE', `evicted ${removed} chat row(s) over the channel cap`, {
                data: { channelId, limit, removed },
            });
        }
    }

    /**
     * Bundles the write together with cap enforcement in one place. The cap protocol needs
     * three steps to interlock in order (compute target channels → write with quota recovery →
     * apply the cap); rewriting that at every call site means missing just one line silently
     * turns the cap off. A new write path only needs to go through this function.
     */
    private async persist(scope: AdapterScope, rows: IndexedDbRow<TType>[], write: () => Promise<void>): Promise<void> {
        const channelIds = this.cappedChannelIds(rows);
        await this.writeWithQuotaRecovery(write, scope, channelIds);
        await this.enforceChannelLimits(scope, channelIds);
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        if (!scope) return item;
        const row = this.createSchema(scope.cid, scope.uid, id, item);

        await this.persist(scope, [row], () => this.db.save(row));
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        if (!scope) return items;
        const rows = items
            .map(item => {
                const id = (item as { id?: string }).id;
                if (!id) return null;
                return this.createSchema(scope.cid, scope.uid, id, item);
            })
            .filter((row): row is IndexedDbRow<TType> => row !== null);

        // Silent data loss otherwise: the caller is told the whole batch was saved and one of the
        // items simply is not there. Counts only — the items are domain content (ADR-0099).
        if (rows.length !== items.length) {
            logger.warn('CACHE', `dropped ${items.length - rows.length} item(s) with no id from saveAll`, {
                data: { type: this.type, dropped: items.length - rows.length, total: items.length },
            });
        }

        await this.persist(scope, rows, () => this.db.saveAll(rows));
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        if (!scope) return null;
        const key = this.buildKey(scope.cid, scope.uid, id);
        const row = await this.db.load<TType>(key);
        return row?.data ?? null;
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        if (!scope) return [];

        if (this.options.executor) {
            const rows = await this.options.executor.execute(this.db, { type: this.type, ...scope }, options);
            return rows.map((row: IndexedDbRow<TType>) => row.data);
        }

        const rows = await this.db.loadAll<TType>(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
        return rows.map((row: IndexedDbRow<TType>) => row.data);
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        await this.db.delete(this.buildKey(scope.cid, scope.uid, id));
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;
        const keys = ids.map(id => this.buildKey(scope.cid, scope.uid, id));
        await this.db.deleteAll(keys);
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        await this.db.clearAll(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
    }

    override async clearByChannelId(channelId: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        const lower = [this.type, scope.cid, scope.uid, channelId];
        const upper = [this.type, scope.cid, scope.uid, channelId, []];
        const range = IDBKeyRange.bound(lower, upper);
        await this.db.clearByRange(CHAT_PAGINATION_INDEX, range);
    }
}
