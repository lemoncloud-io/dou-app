import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { CacheChatView, ChatQueryOptions, LastChatItem } from '@chatic/app-messages';
import type { DomainChat, DomainLastChat, DomainListResult } from '../../domain';
import { createDomainListResult, isPreviewableChat, pickPreviewChat } from '../../domain';
import type { DataContextProvider } from '../../repositories/types';
import type { CacheStorage } from '../ports';
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
}

/**
 * Fallback window depth. Deep enough to find the real message underneath when the newest rows are
 * not previewable (a burst of reactions, say) — the same reasoning as `PREVIEW_LOOKBACK` from the
 * per-row home subscription days (ADR-0047 decision 3).
 */
const LAST_CHAT_FALLBACK_LOOKBACK = 30;

/** Stores chat pages locally and re-emits only the channel timelines touched by each write. */
export class ChatLocalDataSource extends BaseLocalDataSource implements IChatLocalDataSource {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'chat'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainChat | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        query: ChatFeedInput,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChat> | null> {
        const channelId = this.assertRequiredString(query?.channelId, 'channelId');
        const { limit = 50 } = query;

        const pageList = await this.cacheStorage.loadAll({
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
     * not implement it; an older app; a transient error) every channel is read through the window —
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
        const validIds = Array.from(new Set(channelIds.filter(Boolean)));
        if (validIds.length === 0) return [];

        const byChannel = new Map<string, DomainLastChat>();
        const fallbackIds: string[] = [];

        const fast = this.cacheStorage.loadLastPerChannel ? await this.cacheStorage.loadLastPerChannel(validIds) : null;
        if (fast) {
            const fastByChannel = this.indexLastItemsByChannel(fast);
            for (const channelId of validIds) {
                const row = fastByChannel.get(channelId);
                // `{ lastNo: 0, item: null }` for a channel with no rows is a valid answer ("no
                // preview"), so it does not fall back. Only channels missing from the response or
                // failing revalidation do.
                if (!row || (row.item && !isPreviewableChat(row.item))) fallbackIds.push(channelId);
                else byChannel.set(channelId, { channelId, lastNo: row.lastNo ?? 0, chat: row.item ?? null });
            }
        } else {
            fallbackIds.push(...validIds);
        }

        await Promise.all(
            fallbackIds.map(async channelId => {
                const page = await this.cacheReadList(
                    { channelId, limit: LAST_CHAT_FALLBACK_LOOKBACK },
                    contextOverride
                );
                const list = page?.list ?? [];
                const lastNo = list.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);
                const row: DomainLastChat = { channelId, lastNo, chat: pickPreviewChat(list) ?? null };
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
     * scope-global prefix is used. That cost is affordable because this observer exists only while home
     * is mounted and re-runs are coalesced by the 50ms flush.
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
        const id = this.assertRequiredString(item.id, 'id');

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const cid = context.cid || 'default';
        const merged: DomainChat = {
            ...(existing ?? ({} as DomainChat)),
            ...item,
            id,
            cid,
            channelId: item.channelId ?? existing?.channelId ?? '',
            chatNo: item.chatNo ?? existing?.chatNo ?? 0,
            isPending: item.isPending ?? existing?.isPending ?? false,
            isFailed: item.isFailed ?? existing?.isFailed ?? false,
            createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
            updatedAtMs: item.updatedAtMs ?? existing?.updatedAtMs ?? Date.now(),
        };

        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || 'default';
        const existingById = this.indexById(await this.cacheStorage.loadMany(validItems.map(item => item.id!)));

        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            return {
                ...(existing ?? ({} as DomainChat)),
                ...item,
                id: item.id!,
                cid,
                channelId: item.channelId ?? existing?.channelId ?? '',
                chatNo: item.chatNo ?? existing?.chatNo ?? 0,
                isPending: item.isPending ?? existing?.isPending ?? false,
                isFailed: item.isFailed ?? existing?.isFailed ?? false,
                createdAtMs: item.createdAtMs ?? existing?.createdAtMs ?? Date.now(),
                updatedAtMs: item.updatedAtMs ?? existing?.updatedAtMs ?? Date.now(),
            } as DomainChat;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        // All that is needed is which channels' lists to re-read, so ids omitted because they are
        // absent do not matter (`loadMany` guarantees neither result length nor order).
        const existingItems = await this.cacheStorage.loadMany(validIds);
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    public async cacheClearByChannelId(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const requiredChannelId = this.assertRequiredString(channelId, 'channelId');
        await this.cacheStorage.clearByChannelId(requiredChannelId);
        this.scheduleListReemit(this.getAffectedListPrefixes([requiredChannelId], contextOverride));
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
