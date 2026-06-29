import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { CacheChatView, ChatQueryOptions } from '@chatic/app-messages';
import type { DomainChat, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

const getChatNo = (chat: Partial<DomainChat> | CacheChatView): number | undefined => {
    const chatNo = (chat as { chatNo?: number }).chatNo;
    return typeof chatNo === 'number' ? chatNo : undefined;
};

export interface IChatLocalDataSourceV2
    extends ILocalDataSourceV2<DomainChat, ChatFeedInput, DomainListResult<DomainChat>> {
    cacheClearByChannelId(channelId: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void>;
}

/** Stores chat pages locally and re-emits only the channel timelines touched by each write. */
export class ChatLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IChatLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'chat'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainChat | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        query: ChatFeedInput,
        _contextOverride?: LocalDataSourceV2ContextOverride
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
        callback: LocalDataSourceV2Callback<DomainChat | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: ChatFeedInput,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainChat> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainChat>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[ChatLocalDataSourceV2] sid is required in context to save chat.');
        }

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
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChat>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[ChatLocalDataSourceV2] sid is required in context to save chats.');
        }

        const cid = context.cid || 'default';
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));

        const mergedList = validItems.map((item, index) => {
            const existing = existingItems[index];
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
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const existingItems = await Promise.all(validIds.map(id => this.cacheStorage.load(id)));
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item?.channelId),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    public async cacheClearByChannelId(
        channelId: string,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const requiredChannelId = this.assertRequiredString(channelId, 'channelId');
        await this.cacheStorage.clearByChannelId(requiredChannelId);
        this.scheduleListReemit(this.getAffectedListPrefixes([requiredChannelId], contextOverride));
    }

    private getListKey(query: ChatFeedInput, contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.createListObserverKey(
            [
                'chats',
                `channel:${query.channelId || '__none__'}`,
                `cursor:${query.cursorNo ?? 'latest'}`,
                `limit:${query.limit ?? 50}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        channelIds: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueChannels = Array.from(new Set(channelIds.map(channelId => channelId || '__none__')));
        return [`${scopeKey}|chats`, ...uniqueChannels.map(channelId => `${scopeKey}|chats|channel:${channelId}`)];
    }
}
