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
    /**
     * One page of a room's attachments or links of one kind, from this device's cache, newest first.
     *
     * The first call for a room may be slow: it indexes the messages the room already had cached
     * (once per room, see `ChatMediaIndexMarks`). The answer is the same in a browser, in a phone shell
     * with the index and in one without it — only how fast differs.
     */
    listRoomMedia(input: ListRoomMediaInput, contextOverride?: LocalDataSourceContextOverride): Promise<RoomMediaPage>;
    /** How many attachments and links of each kind a room has in this device's cache. */
    countRoomMedia(
        input: { channelId: string },
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<RoomMediaCounts>;
}

export interface ListRoomMediaInput {
    channelId: string;
    kind: ChatMediaKind;
    /** Read below this message number. Absent, from the newest. */
    cursorNo?: number;
    /** How many entries. A page never splits a message, so it can run past this by the rest of its last message. */
    limit: number;
}

export interface RoomMediaItem {
    kind: ChatMediaKind;
    idx: number;
    /** An attachment's server upload id, or a link's URL. */
    ref: string;
    chatId: string;
    chatNo: number;
    /** The message's cached row — its sender, time, `upload$$` and text. */
    chat: DomainChat;
}

export interface RoomMediaPage {
    items: RoomMediaItem[];
    /**
     * The `cursorNo` of the next page. `null` when this device's cache holds nothing further down —
     * which says nothing about what the server still has.
     */
    nextCursorNo: number | null;
}

export type RoomMediaCounts = Record<ChatMediaKind, number>;

/**
 * Rows read per step when a room is indexed, or when its media is read from plain rows. 200 rows is
 * one cheap page in SQLite with the room's newest-first index, and few enough to cross the bridge in
 * one message.
 */
const MEDIA_SCAN_PAGE = 200;

const emptyCounts = (): RoomMediaCounts =>
    Object.fromEntries(CHAT_MEDIA_KINDS.map(kind => [kind, 0])) as RoomMediaCounts;

/**
 * Fallback window depth. Deep enough to find the real message underneath when the newest rows are
 * not previewable (a burst of reactions, say) — the same reasoning as `PREVIEW_LOOKBACK` from the
 * per-row home subscription days (ADR-0047 decision 3).
 */
const LAST_CHAT_FALLBACK_LOOKBACK = 30;

/**
 * How a write settles a deleted mark this device inferred (`hiddenByFeed`, see `ChatRepository`'s
 * `markMissingHidden`). The server leaves `hidden` out of a live row, so a merge would otherwise keep
 * an inferred mark through every page that brings the row back. A copy that does not say it is hidden
 * undoes the mark; one that does turns it into a delete the server stands behind. A row that was
 * hidden by a delete the server sent is left as it is either way.
 */
const inferredHiddenAfter = (
    existing: DomainChat | null | undefined,
    item: Partial<DomainChat>
): Partial<DomainChat> => {
    if (!existing?.hiddenByFeed || item.hiddenByFeed !== undefined) return {};
    return item.hidden ? { hiddenByFeed: false } : { hidden: false, hiddenByFeed: false };
};

/**
 * Whether `item` is an older copy of a row the cache already holds a newer copy of — written by the
 * server earlier than what is cached. Such a copy is not written: a message's state only moves forward.
 *
 * It arrives more often than it sounds. Every message edit or delete is followed by a revision notice,
 * and a device brings the edited message to its current state by reading it again; that read can land
 * after the change the server pushed live, and two quick edits can come back in either order. Without
 * this an edited message could fall back to its previous text, or a deleted one come back.
 *
 * Compared only when both sides carry the server's time (`updatedAtMs` above 0); a row still on its way
 * carries none and is written as before. An equal time is written, so receiving the same row twice
 * settles to the same state — which is also why the delete marks this device infers (`markMissingHidden`,
 * built from the cached copy and so carrying its time) are written.
 */
const isOlderThanCached = (existing: DomainChat | null | undefined, item: Partial<DomainChat>): boolean => {
    const cachedAt = existing?.updatedAtMs ?? 0;
    const incomingAt = item.updatedAtMs ?? 0;
    return cachedAt > 0 && incomingAt > 0 && incomingAt < cachedAt;
};

/**
 * The server time a merged row keeps: the incoming one when it has one, otherwise the cached one, and 0
 * when neither does. Never the device's clock — a device running ahead would make every later server copy
 * look older and be dropped by `isOlderThanCached` — and never a missing time (0) over a real one, which
 * would switch that comparison off for the row.
 */
const serverTimeAfter = (existing: DomainChat | null | undefined, item: Partial<DomainChat>): number =>
    item.updatedAtMs || existing?.updatedAtMs || 0;

/**
 * The row with its media index entries and the rules version they were decided under, as every chat
 * write hands it to storage. The version is what a room fill checks before it writes entries of its own.
 */
const withMediaEntries = (chat: DomainChat): DomainChat => ({
    ...chat,
    mediaEntries: chatMediaEntries(chat),
    mediaEntriesVersion: CHAT_MEDIA_ENTRIES_VERSION,
});

/** A message's entries of one kind, each with the row — what a page lists. */
const mediaItemsOf = (chat: DomainChat, kind: ChatMediaKind): ChatMediaCacheItem[] =>
    chatMediaEntries(chat)
        .filter(entry => entry.kind === kind)
        .sort((a, b) => a.idx - b.idx)
        .map(entry => ({ ...entry, chatId: chat.id, chatNo: chat.chatNo, chat }));

/** Stores chat pages locally and re-emits only the channel timelines touched by each write. */
export class ChatLocalDataSource extends BaseLocalDataSource<'chat'> implements IChatLocalDataSource {
    /** Room indexing in flight, by partition and room, so concurrent first reads wait for one run. */
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

    /**
     * The batch read for a channel list's "last message preview" (ADR-0057).
     *
     * The fast path is storage's `loadLastPerChannel` (one bridge round trip on native). The decision
     * (in SQL) is only an optimization — this layer owns the semantics — so when a returned row
     * disagrees with the current `isPreviewableChat` (older semantics baked into the app), that channel
     * alone is redirected to a windowed read. When the fast path returns `null` (IndexedDB, which does
     * not implement it; a transient error) every channel is read through the window —
     * today's behaviour unchanged is the fallback.
     *
     * `lastNo` is that channel cache's maximum chatNo, regardless of previewability. It is the
     * comparison baseline that keeps the head trigger from misreading "the newest rows are reactions so
     * the preview sits below head" as a shortfall, so the fallback computes it by the same definition.
     */
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
                // `{ lastNo: 0, item: null }` for a channel with no rows is a valid answer ("no
                // preview"), so it does not fall back. Only channels missing from the response or
                // failing revalidation do.
                //
                // A row without `activityItem` came from an app build that predates it, so the
                // channel is read through the window rather than guessed at.
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

        // Preserve the requested order, so a subscriber receives a stable order and only has to index
        // by channel id.
        return validIds.map(channelId => byChannel.get(channelId)).filter((row): row is DomainLastChat => !!row);
    }

    /**
     * The observer form of `cacheReadLastList`. The key is determined by the channel set (sorted, so
     * order does not matter), and any chat write wakes this group through the `chats-last|` prefix
     * (`getAffectedListPrefixes`) — set membership cannot be expressed with startsWith, so a
     * scope-global prefix is used. That cost is affordable because the only long-lived observer is home's
     * list, open only while home is mounted, and re-runs are coalesced by the 50ms flush. A caller that
     * runs on every route should take the first answer and close it rather than hold this open.
     */
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
        // Decided here, on the merged row, so an edit, a delete mark or a re-sent copy all rewrite the
        // message's entries from what the row now says. The store only stores them.
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
        // All that is needed is which channels' lists to re-read, so ids omitted because they are
        // absent do not matter (`loadMany` guarantees neither result length nor order).
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
        // `null` or `NaN` would be an invalid key bound in IndexedDB; both mean "from the newest".
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

    /**
     * Indexes the messages a room already had cached, once. Their rows are only read: each page's
     * entries are computed here and handed to `saveChatMediaEntries`, which writes entries and never a
     * row.
     *
     * Rewriting the rows instead would do two kinds of harm. Every store stamps a row's cache time on
     * save, and the room's page reads that stamp as "the server sent this during this run", so the
     * room's older blocks would no longer be re-checked. And the copy written back is the one read
     * here: a delete mark, a delete or a clear that lands in between would be undone. The store's
     * version check skips every message written since the read — such a write already put the right
     * entries, an empty list for a deleted message — and every message no longer there.
     *
     * A row already at the current version is not sent: its entries came with its write. A row with no
     * version and no entries is not sent either, since nothing was ever indexed for it to clear.
     *
     * The mark is written only after the last page, so a run cut short starts over next time, which
     * lands on the same result. Concurrent first reads of a room share one run.
     */
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
            // The cost of a first read lands here once per room, and is what a slow "loading" on the
            // room's files screen would be explained by.
            logger.info('CACHE', `indexed room media for ${rowCount} cached row(s)`, {
                data: { rows: rowCount, ms: Date.now() - startedAt },
            });
        })().finally(() => this.mediaIndexing.delete(key));
        this.mediaIndexing.set(key, run);
        return run;
    }

    /**
     * A room's cached rows, newest page first. Pages by the lowest message number seen, so it walks
     * the room once whatever order a store returns a page in; unsent rows (number 0) come last and
     * end the walk.
     */
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

    /**
     * The media page built from plain rows — for a store with no index (a phone shell built before
     * it), or a read the index could not answer. The same rules as the index's page: entries of the
     * kind newest message first, a message never split, and `nextCursorNo` only when another message
     * with an entry of the kind is cached below.
     */
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

    /** Indexes the fast-path response by channelId — the response guarantees neither requested order nor length. */
    private indexLastItemsByChannel(items: LastChatItem[]): Map<string, LastChatItem> {
        const byChannel = new Map<string, LastChatItem>();
        for (const item of items) {
            if (item?.channelId) byChannel.set(item.channelId, item);
        }
        return byChannel;
    }

    private getListKey(query: ChatFeedInput, contextOverride?: LocalDataSourceContextOverride): string {
        return this.createListObserverKey(
            // Every field that reaches storage must be in the key: observers on one key share a
            // single query execution, so a field left out would let two different reads collapse
            // into one wrong answer. `cacheReadList` spreads the whole query into `loadAll`, and
            // the executor branches on includeUnsent (sort/keyword go on to the native path).
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
        // Written channels only. A bare `${scopeKey}|chats` prefix matches EVERY chat observer under
        // `key.startsWith(prefix)`, so one write re-read storage for every open channel's list
        // instead of the one that changed. No catch-all entry: `cacheReadList` requires channelId,
        // so a channel-less observer cannot exist. The per-channel prefix still spans that channel's
        // cursor/limit variants.
        // The trailing `|` pins the match to a whole key segment; without it `channel:ch-1` also
        // matches `channel:ch-10`.
        //
        // `chats-last|` is the one deliberate catch-all: the combined last-chat observer's key is a
        // channel SET, which startsWith cannot test membership against — so every chat write wakes
        // it. Scoped to home's single observer and coalesced by the 50ms flush, that is cheaper than
        // inventing a set-aware matcher. `|chats|` keys don't match it (different segment), so the
        // per-channel routing above is untouched.
        //
        return [
            ...uniqueChannels.map(channelId => `${scopeKey}|chats|channel:${channelId}|`),
            `${scopeKey}|chats-last|`,
        ];
    }
}
