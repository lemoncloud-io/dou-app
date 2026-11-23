import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type {
    CacheChatView,
    ChatMediaCacheItem,
    ChatMediaFillItem,
    ChatMediaKind,
    ChatQueryOptions,
    LastChatItem,
} from '@chatic/bridge-messages';
import { CHAT_MEDIA_KINDS } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';
import type { DomainChat, DomainLastChat, DomainListResult } from '../../domain';
import {
    CHAT_MEDIA_ENTRIES_VERSION,
    chatMediaEntries,
    createDomainListResult,
    isActivityChat,
    isPreviewableChat,
    pickActivityChat,
    pickPreviewChat,
} from '../../domain';
import type { DataContext, DataContextProvider } from '../../repositories/types';
import type { CacheStorage, ScopedCacheStorage } from '../ports';
import { type ChatMediaIndexMarks, createMemoryChatMediaIndexMarks } from './chatMediaIndexMarks';
import {
    BaseLocalDataSource,
    type ILocalDataSource,
    type LocalDataSourceCallback,
    type LocalDataSourceContextOverride,
    type LocalDataSourceUnsubscribe,
} from './types';

const getChatNo = (chat: Partial<DomainChat> | CacheChatView): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

export interface IChatLocalDataSource
    extends ILocalDataSource<DomainChat, ChatFeedInput, DomainListResult<DomainChat>> {
    cacheClearByChannelId(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    cacheReadLastList(
        channelIds: string[],
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainLastChat[]>;
    observeLastList(
        channelIds: string[],
        callback: LocalDataSourceCallback<DomainLastChat[]>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe;
    listRoomMedia(input: ListRoomMediaInput, contextOverride?: LocalDataSourceContextOverride): Promise<RoomMediaPage>;
    countRoomMedia(
        input: { channelId: string },
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<RoomMediaCounts>;
}

export interface ListRoomMediaInput {
    channelId: string;
    kind: ChatMediaKind;
    cursorNo?: number;
    limit: number;
}

export interface RoomMediaItem {
    kind: ChatMediaKind;
    idx: number;
    ref: string;
    chatId: string;
    chatNo: number;
    chat: DomainChat;
}

export interface RoomMediaPage {
    items: RoomMediaItem[];
    nextCursorNo: number | null;
}

export type RoomMediaCounts = Record<ChatMediaKind, number>;

const MEDIA_SCAN_PAGE = 200;

const emptyCounts = (): RoomMediaCounts =>
    Object.fromEntries(CHAT_MEDIA_KINDS.map(kind => [kind, 0])) as RoomMediaCounts;

const LAST_CHAT_FALLBACK_LOOKBACK = 30;

const inferredHiddenAfter = (
    existing: DomainChat | null | undefined,
    item: Partial<DomainChat>
): Partial<DomainChat> => {
    if (!existing?.hiddenByFeed || item.hiddenByFeed !== undefined) return {};
    return item.hidden ? { hiddenByFeed: false } : { hidden: false, hiddenByFeed: false };
};

const isOlderThanCached = (existing: DomainChat | null | undefined, item: Partial<DomainChat>): boolean => {
    const cachedAt = existing?.updatedAtMs ?? 0;
    const incomingAt = item.updatedAtMs ?? 0;
    return cachedAt > 0 && incomingAt > 0 && incomingAt < cachedAt;
};

const serverTimeAfter = (existing: DomainChat | null | undefined, item: Partial<DomainChat>): number =>
    item.updatedAtMs || existing?.updatedAtMs || 0;

const withMediaEntries = (chat: DomainChat): DomainChat => ({
    ...chat,
    mediaEntries: chatMediaEntries(chat),
    mediaEntriesVersion: CHAT_MEDIA_ENTRIES_VERSION,
});

const mediaItemsOf = (chat: DomainChat, kind: ChatMediaKind): ChatMediaCacheItem[] =>
    chatMediaEntries(chat)
        .filter(entry => entry.kind === kind)
        .sort((a, b) => a.idx - b.idx)
        .map(entry => ({ ...entry, chatId: chat.id, chatNo: chat.chatNo, chat }));

export class ChatLocalDataSource extends BaseLocalDataSource<'chat'> implements IChatLocalDataSource {
    private readonly mediaIndexing = new Map<string, Promise<void>>();

    constructor(
        contextProvider: DataContextProvider,
        storages: ScopedCacheStorage<'chat'>,
        private readonly mediaIndexMarks: ChatMediaIndexMarks = createMemoryChatMediaIndexMarks()
    ) {
        super(contextProvider, storages);
    }

    public async cacheRead(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadList(
        query: ChatFeedInput,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChat> | null> {
        const channelId = this.assertRequiredString(query?.channelId, 'channelId');
        const { limit = 50 } = query;

        const pageList = await this.storage(contextOverride).loadAll({
            ...query,
            channelId,
            limit,
        } as ChatQueryOptions);

        if (pageList.length === 0) {
            return createDomainListResult([], { total: 0, limit, source: 'local' });
        }

        let nextCursorNo: number | undefined;
        if (pageList.length === limit) {
            nextCursorNo = getChatNo(pageList[0]);
        }

        return createDomainListResult(pageList, {
            total: pageList.length,
            cursorNo: nextCursorNo,
            limit,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainChat | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: ChatFeedInput,
        callback: LocalDataSourceCallback<DomainListResult<DomainChat> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheReadLastList(
        channelIds: string[],
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainLastChat[]> {
        const scope = this.resolveContext(contextOverride);
        const validIds = Array.from(new Set(channelIds.filter(Boolean)));
        if (validIds.length === 0) return [];

        const byChannel = new Map<string, DomainLastChat>();
        const fallbackIds: string[] = [];

        const storage = this.storage(scope);
        const fast = storage.loadLastPerChannel ? await storage.loadLastPerChannel(validIds) : null;
        if (fast) {
            const fastByChannel = this.indexLastItemsByChannel(fast);
            for (const channelId of validIds) {
                const row = fastByChannel.get(channelId);
                const valid =
                    !!row &&
                    row.activityItem !== undefined &&
                    (!row.item || isPreviewableChat(row.item)) &&
                    (!row.activityItem || isActivityChat(row.activityItem));
                if (!row || !valid) fallbackIds.push(channelId);
                else {
                    byChannel.set(channelId, {
                        channelId,
                        lastNo: row.lastNo ?? 0,
                        chat: row.item ?? null,
                        activity: row.activityItem ?? null,
                    });
                }
            }
        } else {
            fallbackIds.push(...validIds);
        }

        await Promise.all(
            fallbackIds.map(async channelId => {
                const page = await this.cacheReadList({ channelId, limit: LAST_CHAT_FALLBACK_LOOKBACK }, scope);
                const list = page?.list ?? [];
                const lastNo = list.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);
                const row: DomainLastChat = {
                    channelId,
                    lastNo,
                    chat: pickPreviewChat(list) ?? null,
                    activity: pickActivityChat(list) ?? null,
                };
                byChannel.set(channelId, row);
            })
        );

        return validIds.map(channelId => byChannel.get(channelId)).filter((row): row is DomainLastChat => !!row);
    }

    public observeLastList(
        channelIds: string[],
        callback: LocalDataSourceCallback<DomainLastChat[]>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        const validIds = Array.from(new Set(channelIds.filter(Boolean)));
        const key = this.createListObserverKey(
            ['chats-last', `channels:${[...validIds].sort().join(',')}`],
            contextOverride
        );
        return this.observeListQuery(key, () => this.cacheReadLastList(validIds, contextOverride), callback);
    }

    public async cacheWrite(
        item: Partial<DomainChat>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(item.id, 'id');

        const storage = this.storage(scope);
        const existing = await storage.load(id);
        if (isOlderThanCached(existing, item)) return;
        const cid = scope.cid || 'default';
        const merged: DomainChat = {
            ...(existing ?? ({} as DomainChat)),
            ...item,
            ...inferredHiddenAfter(existing, item),
            id,
            cid,
            channelId: item.channelId ?? existing?.channelId ?? '',
            chatNo: item.chatNo ?? existing?.chatNo ?? 0,
            isPending: item.isPending ?? existing?.isPending ?? false,
            isFailed: item.isFailed ?? existing?.isFailed ?? false,
            createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
            updatedAtMs: serverTimeAfter(existing, item),
        };
        const written = withMediaEntries(merged);

        await storage.save(id, written);
        this.scheduleItemReemit([id], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], scope));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const cid = scope.cid || 'default';
        const storage = this.storage(scope);
        const existingById = this.indexById(await storage.loadMany(validItems.map(item => item.id!)));
        const freshItems = validItems.filter(item => !isOlderThanCached(existingById.get(item.id!), item));
        if (freshItems.length === 0) return;

        const mergedList = freshItems.map(item => {
            const existing = existingById.get(item.id!);
            return withMediaEntries({
                ...(existing ?? ({} as DomainChat)),
                ...item,
                ...inferredHiddenAfter(existing, item),
                id: item.id!,
                cid,
                channelId: item.channelId ?? existing?.channelId ?? '',
                chatNo: item.chatNo ?? existing?.chatNo ?? 0,
                isPending: item.isPending ?? existing?.isPending ?? false,
                isFailed: item.isFailed ?? existing?.isFailed ?? false,
                createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
                updatedAtMs: serverTimeAfter(existing, item),
            } as DomainChat);
        });

        await storage.saveAll(mergedList);
        this.scheduleItemReemit(freshItems.map(item => item.id!).filter(Boolean), scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.map(item => item.channelId),
                scope
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(requiredId);
        await storage.delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], scope));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const storage = this.storage(scope);
        const existingItems = await storage.loadMany(validIds);
        await storage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.channelId),
                scope
            )
        );
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }

    public async cacheClearByChannelId(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredChannelId = this.assertRequiredString(channelId, 'channelId');
        await this.storage(scope).clearByChannelId(requiredChannelId);
        this.scheduleListReemit(this.getAffectedListPrefixes([requiredChannelId], scope));
    }

    public async listRoomMedia(
        input: ListRoomMediaInput,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<RoomMediaPage> {
        const scope = this.resolveContext(contextOverride);
        const channelId = this.assertRequiredString(input?.channelId, 'channelId');
        const limit = Math.max(1, Math.floor(input.limit) || 1);
        const cursorNo = Number.isFinite(input.cursorNo) ? input.cursorNo : undefined;
        const query = { channelId, kind: input.kind, cursorNo, limit };
        const storage = this.storage(scope);

        if (storage.canQueryChatMedia?.() && storage.loadChatMedia && storage.saveChatMediaEntries) {
            try {
                await this.ensureMediaIndexed(storage, channelId, scope);
                const page = await storage.loadChatMedia(query);
                if (page) return page;
            } catch (error) {
                logger.warn('CACHE', 'room media index read failed — reading plain rows instead', {
                    error,
                    data: { kind: input.kind },
                });
            }
        }
        return this.listRoomMediaFromRows(storage, query);
    }

    public async countRoomMedia(
        input: { channelId: string },
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<RoomMediaCounts> {
        const scope = this.resolveContext(contextOverride);
        const channelId = this.assertRequiredString(input?.channelId, 'channelId');
        const storage = this.storage(scope);

        if (storage.canQueryChatMedia?.() && storage.countChatMedia && storage.saveChatMediaEntries) {
            try {
                await this.ensureMediaIndexed(storage, channelId, scope);
                const counts = await storage.countChatMedia(channelId);
                if (counts) return { ...emptyCounts(), ...counts };
            } catch (error) {
                logger.warn('CACHE', 'room media index count failed — counting plain rows instead', { error });
            }
        }

        const counts = emptyCounts();
        for await (const rows of this.scanRoomRows(storage, channelId)) {
            for (const row of rows) for (const entry of chatMediaEntries(row)) counts[entry.kind] += 1;
        }
        return counts;
    }

    private ensureMediaIndexed(storage: CacheStorage<'chat'>, channelId: string, scope: DataContext): Promise<void> {
        const key = `${this.getScopeKey(scope)}|${channelId}`;
        const running = this.mediaIndexing.get(key);
        if (running) return running;

        const run = (async () => {
            if (await this.mediaIndexMarks.isIndexed(channelId, scope)) return;
            const startedAt = Date.now();
            let rowCount = 0;
            for await (const rows of this.scanRoomRows(storage, channelId)) {
                rowCount += rows.length;
                const items: ChatMediaFillItem[] = [];
                for (const row of rows) {
                    const version = row.mediaEntriesVersion ?? 0;
                    if (!row.id || version >= CHAT_MEDIA_ENTRIES_VERSION) continue;
                    const entries = chatMediaEntries(row);
                    if (entries.length === 0 && row.mediaEntriesVersion === undefined) continue;
                    items.push({ chatId: row.id, channelId: row.channelId, chatNo: row.chatNo, entries });
                }
                if (items.length > 0) await storage.saveChatMediaEntries?.(items, CHAT_MEDIA_ENTRIES_VERSION);
            }
            await this.mediaIndexMarks.markIndexed(channelId, scope);
            logger.info('CACHE', `indexed room media for ${rowCount} cached row(s)`, {
                data: { rows: rowCount, ms: Date.now() - startedAt },
            });
        })().finally(() => this.mediaIndexing.delete(key));
        this.mediaIndexing.set(key, run);
        return run;
    }

    private async *scanRoomRows(storage: CacheStorage<'chat'>, channelId: string): AsyncGenerator<DomainChat[]> {
        let cursorNo: number | undefined;
        for (;;) {
            const rows = await storage.loadAll({ channelId, cursorNo, limit: MEDIA_SCAN_PAGE } as ChatQueryOptions);
            if (rows.length === 0) return;
            yield rows;
            const lowest = rows.reduce((min, row) => Math.min(min, row.chatNo ?? 0), Number.POSITIVE_INFINITY);
            if (rows.length < MEDIA_SCAN_PAGE || lowest <= 0) return;
            cursorNo = lowest;
        }
    }

    private async listRoomMediaFromRows(
        storage: CacheStorage<'chat'>,
        query: { channelId: string; kind: ChatMediaKind; cursorNo?: number; limit: number }
    ): Promise<RoomMediaPage> {
        const items: ChatMediaCacheItem[] = [];
        let lastNo: number | null = null;
        let cursorNo = query.cursorNo;
        for (;;) {
            const rows = await storage.loadAll({
                channelId: query.channelId,
                cursorNo,
                limit: MEDIA_SCAN_PAGE,
            } as ChatQueryOptions);
            const newestFirst = [...rows].sort((a, b) => (b.chatNo ?? 0) - (a.chatNo ?? 0));
            for (const row of newestFirst) {
                const entries = mediaItemsOf(row, query.kind);
                if (entries.length === 0) continue;
                if (items.length >= query.limit) return { items, nextCursorNo: lastNo };
                items.push(...entries);
                lastNo = row.chatNo;
            }
            const lowest = rows.reduce((min, row) => Math.min(min, row.chatNo ?? 0), Number.POSITIVE_INFINITY);
            if (rows.length < MEDIA_SCAN_PAGE || lowest <= 0) return { items, nextCursorNo: null };
            cursorNo = lowest;
        }
    }

    private indexLastItemsByChannel(items: LastChatItem[]): Map<string, LastChatItem> {
        const byChannel = new Map<string, LastChatItem>();
        for (const item of items) {
            if (item?.channelId) byChannel.set(item.channelId, item);
        }
        return byChannel;
    }

    private getListKey(query: ChatFeedInput, contextOverride?: LocalDataSourceContextOverride): string {
        return this.createListObserverKey(
            [
                'chats',
                `channel:${query.channelId || '__none__'}`,
                `cursor:${query.cursorNo ?? 'latest'}`,
                `limit:${query.limit ?? 50}`,
                `unsent:${(query as { includeUnsent?: boolean }).includeUnsent ? 1 : 0}`,
                `sort:${(query as { sort?: string }).sort ?? 'default'}`,
                `keyword:${(query as { keyword?: string }).keyword ?? ''}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        channelIds: Array<string | undefined>,
        contextOverride?: LocalDataSourceContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueChannels = Array.from(new Set(channelIds.map(channelId => channelId || '__none__')));
        return [
            ...uniqueChannels.map(channelId => `${scopeKey}|chats|channel:${channelId}|`),
            `${scopeKey}|chats-last|`,
        ];
    }
}
