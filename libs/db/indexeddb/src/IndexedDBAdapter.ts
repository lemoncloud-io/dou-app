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
    IndexedDbConnection,
    IndexedDbChatMediaRow,
    DbQueryExecutor,
    IndexedDbRow,
} from '@chatic/data';
import { createTtlMeta, withCacheMeta } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { BaseDbAdapter } from '@chatic/data';
import { CHAT_MEDIA_INDEX, CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX, UNSENT_CHAT_NO } from './IndexedDBDatabase';

const CHAT_MEDIA_TYPE = 'chatmedia';

const mediaKeyPrefix = (cid: string, uid: string, chatId: string): string =>
    `${CHAT_MEDIA_TYPE}:${cid}:${uid}:${chatId}`;

const mediaKey = (cid: string, uid: string, chatId: string, idx: number): string =>
    `${mediaKeyPrefix(cid, uid, chatId)}\u0000${String(idx).padStart(4, '0')}`;

const mediaKeyRange = (cid: string, uid: string, chatId: string): IDBKeyRange => {
    const prefix = mediaKeyPrefix(cid, uid, chatId);
    return IDBKeyRange.bound(`${prefix}\u0000`, `${prefix}\u0001`, false, true);
};

export const isQuotaExceededError = (error: unknown): boolean =>
    error instanceof DOMException && error.name === 'QuotaExceededError';

const EVICTABLE_CHAT_NO_FLOOR = UNSENT_CHAT_NO + 1;

export interface IndexedDBAdapterOptions<TType extends CacheType> {
    executor?: DbQueryExecutor<TType>;
    maxChatsPerChannel?: number;
}

export class IndexedDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly db: IndexedDbConnection,
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

    private mediaWrites(
        scope: AdapterScope,
        rows: IndexedDbRow<TType>[]
    ): { deleteRanges: IDBKeyRange[]; put: IndexedDbChatMediaRow[] } | null {
        if (this.type !== 'chat') return null;
        const deleteRanges: IDBKeyRange[] = [];
        const put: IndexedDbChatMediaRow[] = [];
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

    private cappedChannelIds(rows: IndexedDbRow<TType>[]): string[] {
        if (this.options.maxChatsPerChannel === undefined || this.type !== 'chat') return [];
        const evictable = rows.filter(row => (row.chat_no ?? UNSENT_CHAT_NO) >= EVICTABLE_CHAT_NO_FLOOR);
        return Array.from(new Set(evictable.map(row => row.channel_id).filter((id): id is string => !!id)));
    }

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
                logger.error('CACHE', 'web cache quota exceeded with nothing to evict', { error });
                throw error;
            }
            await this.enforceChannelLimits(scope, channelIds);
            try {
                await write();
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
            logger.info('CACHE', `evicted ${removed} chat row(s) over the channel cap`, {
                data: { channelId, limit, removed },
            });
        }
    }

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

    canQueryChatMedia(): boolean {
        return this.type === 'chat';
    }

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
            if (boundaryNo !== null && entry.chat_no < boundaryNo) {
                nextCursorNo = boundaryNo;
                return false;
            }
            entries.push(entry);
            if (boundaryNo === null && entries.length >= query.limit) boundaryNo = entry.chat_no;
            return true;
        });

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
