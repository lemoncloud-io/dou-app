import { logger } from '@chatic/bridges';
import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    ChatMediaCounts,
    ChatMediaFillItem,
    ChatMediaPage,
    OnCountChatMediaCacheDataPayload,
    OnFetchChatMediaCacheDataPayload,
    OnSaveChatMediaCacheDataPayload,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
    ClearCacheDataByChannelPayload,
    ClearCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    FetchManyCacheDataPayload,
    LastChatItem,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    OnFetchLastChatsDataPayload,
    OnFetchManyCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/bridge-messages';
import type { ChatMediaQuery, DataContextProvider } from '@chatic/data';
import { stableHash, withCacheMeta } from '@chatic/data';
import { BaseDbAdapter } from '../base/BaseDbAdapter';
import type { CacheBridgeClient } from './cacheBridge';
import { type NativeCacheOperation, recordNativeCacheOperation } from './nativeCacheMetrics';

const OPERATION_BY_MESSAGE: Record<string, NativeCacheOperation> = {
    SaveCacheData: 'save',
    SaveAllCacheData: 'saveAll',
    FetchCacheData: 'load',
    FetchManyCacheData: 'loadMany',
    FetchAllCacheData: 'loadAll',
    FetchLastChatsData: 'loadLast',
    DeleteCacheData: 'delete',
    DeleteAllCacheData: 'deleteAll',
    ClearCacheData: 'clearAll',
    ClearCacheDataByChannel: 'clearByChannel',
    FetchChatMediaCacheData: 'loadMedia',
    CountChatMediaCacheData: 'countMedia',
    SaveChatMediaCacheData: 'saveMedia',
};

export type OptionalNativeCacheMessage =
    | 'FetchChatMediaCacheData'
    | 'CountChatMediaCacheData'
    | 'SaveChatMediaCacheData';

const CHAT_MEDIA_MESSAGES: readonly OptionalNativeCacheMessage[] = [
    'FetchChatMediaCacheData',
    'CountChatMediaCacheData',
    'SaveChatMediaCacheData',
];

export interface NativeDBAdapterOptions {
    handlesMessage?: (message: OptionalNativeCacheMessage) => boolean;
}

export class NativeDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    private readonly inflightReads = new Map<string, Promise<unknown>>();

    constructor(
        private readonly bridge: CacheBridgeClient,
        type: TType,
        contextProvider: DataContextProvider,
        private readonly options: NativeDBAdapterOptions = {}
    ) {
        super(type, contextProvider);
    }

    private async send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const startedAt = Date.now();
        try {
            return await this.bridge.request(message);
        } finally {
            recordNativeCacheOperation(OPERATION_BY_MESSAGE[message.type], this.type, Date.now() - startedAt);
        }
    }

    private sendRead<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const key = stableHash(message);
        const existing = this.inflightReads.get(key);
        if (existing) return existing as Promise<WebMessageResponse<K>>;

        const request = this.send(message).finally(() => {
            this.inflightReads.delete(key);
        });
        this.inflightReads.set(key, request);
        return request;
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        if (!scope) return item;

        await this.send({
            type: 'SaveCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
                item: withCacheMeta(this.type, item),
            } as unknown as Extract<SaveCacheDataPayload, { type: TType }>,
        });
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        if (!scope) return items;

        await this.send({
            type: 'SaveAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                items: items.map(item => withCacheMeta(this.type, item)),
            } as unknown as Extract<SaveAllCacheDataPayload, { type: TType }>,
        });
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        if (!scope) return null;

        const response = await this.sendRead({
            type: 'FetchCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<FetchCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchCacheDataPayload, { type: TType }> | undefined;
        return (data?.item ?? null) as CacheModelOf<TType> | null;
    }

    override async loadMany(ids: string[]): Promise<CacheModelOf<TType>[]> {
        if (ids.length === 0) return [];

        const scope = this.getScope();
        if (!scope) return [];

        const response = await this.sendRead({
            type: 'FetchManyCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                ids,
            } as Extract<FetchManyCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchManyCacheDataPayload, { type: TType }> | undefined;
        return (data?.items ?? []) as CacheModelOf<TType>[];
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        if (!scope) return [];
        const query = {
            cid: scope.cid,
            uid: scope.uid,
            ...options,
        };

        const response = await this.sendRead({
            type: 'FetchAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                query,
            } as Extract<FetchAllCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchAllCacheDataPayload, { type: TType }> | undefined;
        return (data?.items ?? []) as CacheModelOf<TType>[];
    }

    async loadLastPerChannel(channelIds: string[]): Promise<LastChatItem[] | null> {
        if (this.type !== 'chat') return null;
        if (channelIds.length === 0) return [];

        const scope = this.getScope();
        if (!scope) return [];
        try {
            const response = await this.sendRead({
                type: 'FetchLastChatsData',
                data: { type: 'chat', cid: scope.cid, uid: scope.uid, channelIds },
            });
            const data = response?.data as OnFetchLastChatsDataPayload | undefined;
            return data?.items ?? null;
        } catch (error) {
            logger.warn('CACHE', '[NativeDBAdapter] last-chats read failed — falling back this read', { error });
            return null;
        }
    }

    canQueryChatMedia(): boolean {
        const handles = this.options.handlesMessage;
        return this.type === 'chat' && !!handles && CHAT_MEDIA_MESSAGES.every(message => handles(message));
    }

    async saveChatMediaEntries(items: ChatMediaFillItem[], version: number): Promise<void> {
        if (!this.canQueryChatMedia()) throw new Error('[NativeDBAdapter] the shell has no room media index');
        if (items.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;
        const response = await this.send({
            type: 'SaveChatMediaCacheData',
            data: { type: 'chat', cid: scope.cid, uid: scope.uid, items, version },
        });
        const data = response?.data as OnSaveChatMediaCacheDataPayload | undefined;
        if (!data?.success) throw new Error('[NativeDBAdapter] the shell did not write the room media fill');
    }

    async loadChatMedia(query: ChatMediaQuery): Promise<ChatMediaPage | null> {
        if (!this.canQueryChatMedia()) return null;
        const scope = this.getScope();
        if (!scope) return { items: [], nextCursorNo: null };
        try {
            const response = await this.sendRead({
                type: 'FetchChatMediaCacheData',
                data: {
                    type: 'chat',
                    cid: scope.cid,
                    uid: scope.uid,
                    channelId: query.channelId,
                    kind: query.kind,
                    ...(query.cursorNo !== undefined ? { cursorNo: query.cursorNo } : {}),
                    limit: query.limit,
                },
            });
            const data = response?.data as OnFetchChatMediaCacheDataPayload | undefined;
            if (!data?.items) return null;
            return { items: data.items, nextCursorNo: data.nextCursorNo ?? null };
        } catch (error) {
            logger.warn('CACHE', '[NativeDBAdapter] room media read failed — falling back this read', { error });
            return null;
        }
    }

    async countChatMedia(channelId: string): Promise<ChatMediaCounts | null> {
        if (!this.canQueryChatMedia()) return null;
        const scope = this.getScope();
        if (!scope) return null;
        try {
            const response = await this.sendRead({
                type: 'CountChatMediaCacheData',
                data: { type: 'chat', cid: scope.cid, uid: scope.uid, channelId },
            });
            const data = response?.data as OnCountChatMediaCacheDataPayload | undefined;
            return data?.counts ?? null;
        } catch (error) {
            logger.warn('CACHE', '[NativeDBAdapter] room media count failed — falling back this read', { error });
            return null;
        }
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'DeleteCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<DeleteCacheDataPayload, { type: TType }>,
        });
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'DeleteAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                ids,
            } as Extract<DeleteAllCacheDataPayload, { type: TType }>,
        });
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;

        await this.send({
            type: 'ClearCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
            } as Extract<ClearCacheDataPayload, { type: TType }>,
        });
    }

    override async clearByChannelId(channelId: string): Promise<void> {
        const scope = this.getScope();
        if (!scope) return;
        await this.send({
            type: 'ClearCacheDataByChannel',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                channelId,
            } as Extract<ClearCacheDataByChannelPayload, { type: TType }>,
        });
    }
}
