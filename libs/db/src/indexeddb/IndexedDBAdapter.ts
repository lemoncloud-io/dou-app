import type {
    CacheChatView,
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    ChatMediaCacheItem,
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaPage,
} from '@chatic/bridge-messages';
import { CHAT_MEDIA_KINDS } from '@chatic/bridge-messages';
import type {
    AdapterScope,
    ChatMediaQuery,
    DataContextProvider,
    IIndexedDB,
    IndexedDbChatMediaRow,
    IndexedDbQueryExecutor,
    IndexedDbRow,
} from '@chatic/data';
import { createTtlMeta, withCacheMeta } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { BaseDbAdapter } from '../base/BaseDbAdapter';
import { CHAT_MEDIA_INDEX, CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

/** The `type` of a media index record — not a `CacheType`: it is never read or written on its own. */
const CHAT_MEDIA_TYPE = 'chatmedia';

/**
 * The key of one message's media entries, before the entry's own part.
 *
 * Followed by NUL, not `:`. A chat id is `<channelId>:<chatNo>`, and nothing promises a channel id is
 * free of `:`, so with `:` the range for message `x:12` would also cover `x:12:7`'s entries. NUL sorts
 * below every character an id can hold, so `[prefix + NUL, prefix + \u0001)` is exactly one message.
 */
const mediaKeyPrefix = (cid: string, uid: string, chatId: string): string =>
    `${CHAT_MEDIA_TYPE}:${cid}:${uid}:${chatId}`;

/** Four digits, so keys sort by `idx` as text — a message has at most ten attachments and a few links. */
const mediaKey = (cid: string, uid: string, chatId: string, idx: number): string =>
    `${mediaKeyPrefix(cid, uid, chatId)}\u0000${String(idx).padStart(4, '0')}`;

/** Every media entry of one message. */
const mediaKeyRange = (cid: string, uid: string, chatId: string): IDBKeyRange => {
    const prefix = mediaKeyPrefix(cid, uid, chatId);
    return IDBKeyRange.bound(`${prefix}\u0000`, `${prefix}\u0001`, false, true);
};

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
     * The media index records a chat row's write replaces: the ranges to clear and the entries to
     * put, for rows that carry `mediaEntries`. A row without the field leaves its message's entries
     * untouched — it was written by a web build that predates the index — while an empty list clears
     * them. The two are kept apart on purpose: treating absent as empty would erase the index on every
     * write an older bundle makes.
     */
    private mediaWrites(
        scope: AdapterScope,
        rows: IndexedDbRow<TType>[]
    ): { deleteRanges: IDBKeyRange[]; put: IndexedDbChatMediaRow[] } | null {
        if (this.type !== 'chat') return null;
        const deleteRanges: IDBKeyRange[] = [];
        const put: IndexedDbChatMediaRow[] = [];
        // One message twice in a batch keeps the last copy, as the row's own put does and as the shell's
        // statements in order do — every delete runs before every put here, so both copies' entries
        // would otherwise survive.
        const lastById = new Map(rows.map(row => [row.id, row]));
        for (const row of lastById.values()) {
            const chat = row.data as unknown as CacheChatView;
            if (!Array.isArray(chat.mediaEntries)) continue;
            deleteRanges.push(mediaKeyRange(scope.cid, scope.uid, row.id));
            for (const entry of chat.mediaEntries) {
                put.push({
                    key: mediaKey(scope.cid, scope.uid, row.id, entry.idx),
                    type: CHAT_MEDIA_TYPE,
                    cid: scope.cid,
                    uid: scope.uid,
                    channel_id: row.channel_id ?? '',
                    chat_no: row.chat_no ?? UNSENT_CHAT_NO,
                    kind: entry.kind,
                    chat_id: row.id,
                    idx: entry.idx,
                    ref: entry.ref,
                });
            }
        }
        return deleteRanges.length > 0 ? { deleteRanges, put } : null;
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
            // The evicted messages' media entries. The removal above is "this channel at or below the
            // boundary's message number", and an entry carries its message's channel and number, so
            // the same bound per kind is exactly their entries.
            const boundaryNo = (boundary as unknown[])[4];
            if (typeof boundaryNo === 'number') {
                const mediaPrefix = [CHAT_MEDIA_TYPE, scope.cid, scope.uid, channelId];
                for (const kind of CHAT_MEDIA_KINDS) {
                    await this.db.clearByRange(
                        CHAT_MEDIA_INDEX,
                        IDBKeyRange.bound(
                            [...mediaPrefix, kind, EVICTABLE_CHAT_NO_FLOOR],
                            [...mediaPrefix, kind, boundaryNo]
                        )
                    );
                }
            }
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
        const media = this.mediaWrites(scope, [row]);

        await this.persist(scope, [row], () =>
            media
                ? this.db.writeBatch({ deleteRanges: media.deleteRanges, put: [row, ...media.put] })
                : this.db.save(row)
        );
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

        const media = this.mediaWrites(scope, rows);
        await this.persist(scope, rows, () =>
            media
                ? this.db.writeBatch({ deleteRanges: media.deleteRanges, put: [...rows, ...media.put] })
                : this.db.saveAll(rows)
        );
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
        const key = this.buildKey(scope.cid, scope.uid, id);
        if (this.type === 'chat') {
            await this.db.writeBatch({ deleteKeys: [key], deleteRanges: [mediaKeyRange(scope.cid, scope.uid, id)] });
            return;
        }
        await this.db.delete(key);
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;
        const keys = ids.map(id => this.buildKey(scope.cid, scope.uid, id));
        if (this.type === 'chat') {
            await this.db.writeBatch({
                deleteKeys: keys,
                deleteRanges: ids.map(id => mediaKeyRange(scope.cid, scope.uid, id)),
            });
            return;
        }
        await this.db.deleteAll(keys);
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        await this.db.clearAll(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
        if (this.type === 'chat') await this.db.clearAll(TYPE_CID_UID_INDEX, [CHAT_MEDIA_TYPE, scope.cid, scope.uid]);
    }

    override async clearByChannelId(channelId: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        const lower = [this.type, scope.cid, scope.uid, channelId];
        const upper = [this.type, scope.cid, scope.uid, channelId, []];
        const range = IDBKeyRange.bound(lower, upper);
        await this.db.clearByRange(CHAT_PAGINATION_INDEX, range);
        if (this.type === 'chat') {
            const mediaPrefix = [CHAT_MEDIA_TYPE, scope.cid, scope.uid, channelId];
            await this.db.clearByRange(CHAT_MEDIA_INDEX, IDBKeyRange.bound(mediaPrefix, [...mediaPrefix, []]));
        }
    }

    /** The index lives beside the chat rows in this store, so it can always be read. */
    canQueryChatMedia(): boolean {
        return this.type === 'chat';
    }

    /**
     * One page of a room's media entries of one kind (`ChatMediaQuery`'s rules), read newest first
     * off `CHAT_MEDIA_INDEX` and finished with one look past the page to tell whether more lie below.
     */
    async loadChatMedia(query: ChatMediaQuery): Promise<ChatMediaPage | null> {
        if (this.type !== 'chat') return null;
        const scope = this.getScope();
        if (!scope) return { items: [], nextCursorNo: null };

        const prefix = [CHAT_MEDIA_TYPE, scope.cid, scope.uid, query.channelId, query.kind];
        const below = query.cursorNo !== undefined;
        const range = IDBKeyRange.bound(
            [...prefix, -Infinity],
            [...prefix, below ? query.cursorNo : Infinity],
            false,
            below
        );

        const entries: IndexedDbChatMediaRow[] = [];
        let boundaryNo: number | null = null;
        let nextCursorNo: number | null = null;
        await this.db.walkIndex<IndexedDbChatMediaRow>(CHAT_MEDIA_INDEX, range, 'prev', entry => {
            // A message below the one the limit landed in: there is more, and the page is done.
            if (boundaryNo !== null && entry.chat_no < boundaryNo) {
                nextCursorNo = boundaryNo;
                return false;
            }
            entries.push(entry);
            if (boundaryNo === null && entries.length >= query.limit) boundaryNo = entry.chat_no;
            return true;
        });

        // `prev` hands one message's entries in reverse key order; the page lists them by `idx`.
        entries.sort(
            (a, b) =>
                b.chat_no - a.chat_no || (a.chat_id < b.chat_id ? -1 : a.chat_id > b.chat_id ? 1 : 0) || a.idx - b.idx
        );
        const chatIds = Array.from(new Set(entries.map(entry => entry.chat_id)));
        const rows = await Promise.all(
            chatIds.map(chatId => this.db.load<'chat'>(this.buildKey(scope.cid, scope.uid, chatId)))
        );
        const chatById = new Map(
            rows.filter((row): row is IndexedDbRow<'chat'> => !!row).map(row => [row.id, row.data])
        );

        const items: ChatMediaCacheItem[] = [];
        for (const entry of entries) {
            const chat = chatById.get(entry.chat_id);
            if (!chat) continue;
            items.push({
                kind: entry.kind,
                idx: entry.idx,
                ref: entry.ref,
                chatId: entry.chat_id,
                chatNo: entry.chat_no,
                chat,
            });
        }
        return { items, nextCursorNo };
    }

    /**
     * A room fill's entries, written only for messages whose row is still here at an older rules
     * version — the check and the write share one transaction (`applyChatMediaFill`). No row is written.
     */
    async saveChatMediaEntries(items: ChatMediaFillItem[], version: number): Promise<void> {
        if (this.type !== 'chat' || items.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;
        await this.db.applyChatMediaFill(
            items.map(item => ({
                chatKey: this.buildKey(scope.cid, scope.uid, item.chatId),
                entriesRange: mediaKeyRange(scope.cid, scope.uid, item.chatId),
                entries: item.entries.map(entry => ({
                    key: mediaKey(scope.cid, scope.uid, item.chatId, entry.idx),
                    type: CHAT_MEDIA_TYPE,
                    cid: scope.cid,
                    uid: scope.uid,
                    kind: entry.kind,
                    chat_id: item.chatId,
                    idx: entry.idx,
                    ref: entry.ref,
                })),
            })),
            version
        );
    }

    /** A room's entries counted per kind — one key-only count per kind. */
    async countChatMedia(channelId: string): Promise<ChatMediaCounts | null> {
        if (this.type !== 'chat') return null;
        const scope = this.getScope();
        const counts = Object.fromEntries(CHAT_MEDIA_KINDS.map(kind => [kind, 0])) as ChatMediaCounts;
        if (!scope) return counts;
        await Promise.all(
            CHAT_MEDIA_KINDS.map(async kind => {
                const prefix = [CHAT_MEDIA_TYPE, scope.cid, scope.uid, channelId, kind];
                counts[kind] = await this.db.count(
                    CHAT_MEDIA_INDEX,
                    IDBKeyRange.bound([...prefix, -Infinity], [...prefix, Infinity])
                );
            })
        );
        return counts;
    }
}
