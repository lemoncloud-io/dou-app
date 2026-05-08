import type { ChatMinePayload } from '@lemoncloud/chatic-sockets-api';
import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { CacheStorage, CacheStorageItem } from '../storages';
import type { DataContextProvider } from '../../repositories';
import { toDomainChannel } from './mappers';
import { createDomainListResult, type DomainChannel, type DomainListResult } from '../../domain';
import { toDomainChannel as toDomainChannelBase } from '../../domain';

export interface IChannelLocalDataSource
    extends ICrudLocalDataSource<DomainChannel>,
        IListLocalDataSource<DomainChannel, ChatMinePayload>,
        IStreamLocalDataSource<DomainChannel, ChatMinePayload, DomainListResult<DomainChannel>> {
    /** 채널 목록을 로컬 캐시에서 조회하고 payload 기준으로 정렬/페이지네이션합니다. */
    fetchChannel(
        payload: ChatMinePayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null>;
    /** 단일 채널을 id로 조회합니다. */
    getChannel(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChannel | null>;
    /** 단일 채널을 저장/병합합니다. */
    upsertChannel(channel: Partial<DomainChannel>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 채널을 저장/병합합니다. */
    upsertChannels(
        channels: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
    /** 단일 채널을 삭제합니다. */
    deleteChannel(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다중 채널을 삭제합니다. */
    deleteChannels(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 채널 일부 필드만 병합 업데이트합니다. */
    updateChannelPartial(
        id: string,
        patch: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;

    /** 현재 스코프의 채널 캐시를 모두 비웁니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 채널 목록 조회 결과를 스트림으로 구독합니다. */
    subscribeChannelList(
        payload: ChatMinePayload,
        callback: LocalStreamCallback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;

    /** 단일 채널 조회 결과를 스트림으로 구독합니다. */
    subscribeChannel(
        id: string,
        callback: LocalStreamCallback<DomainChannel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
}

const getChannelSortTime = (channel: Partial<DomainChannel> | ChannelCache): number => {
    const lastChatCreatedAt = (channel as { lastChat$?: { createdAt?: string | number } }).lastChat$?.createdAt;
    const updatedAt = (channel as { updatedAt?: string | number }).updatedAt;
    const value = lastChatCreatedAt ?? updatedAt ?? 0;
    return typeof value === 'number' ? value : new Date(value).getTime();
};

const getPayloadPlaceId = (payload: ChatMinePayload): string | undefined => {
    const maybePayload = payload as { placeId?: string; sid?: string };
    const placeId = maybePayload.placeId ?? maybePayload.sid;
    return placeId && placeId !== 'default' ? placeId : undefined;
};

type ChannelCache = CacheStorageItem<'channel'>;

/** 채널 캐시 read/write와 서버 응답 형태에 맞춘 list 가공을 담당합니다. */
export class ChannelLocalDataSource extends BaseLocalDataSource implements IChannelLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'channel'>
    ) {
        super(contextProvider);
    }

    public async fetchChannel(
        payload: ChatMinePayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        // sid(place) 기준으로 로컬 목록을 스코프한 뒤 최신 대화 순으로 정렬합니다.
        const context = this.getContext(contextOverride);
        const allChannels = await this.cacheStorage.loadAll();
        const placeId = getPayloadPlaceId(payload) ?? context.sid;
        const scopedChannels = placeId ? allChannels.filter(channel => channel.sid === placeId) : allChannels;

        if (scopedChannels.length === 0) return null;

        const sorted = [...scopedChannels].sort((left, right) => getChannelSortTime(right) - getChannelSortTime(left));
        const limit = (payload as { limit?: number }).limit;
        const page = (payload as { page?: number }).page ?? 0;
        const start = limit ? page * limit : 0;
        const list = limit ? sorted.slice(start, start + limit) : sorted;

        return createDomainListResult(
            {
                list: list.map(toDomainChannel),
                total: scopedChannels.length,
                limit,
                page,
            },
            { source: 'local' }
        );
    }

    public async getChannel(
        id: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChannel | null> {
        const item = await this.cacheStorage.load(id);
        return item ? toDomainChannel(item) : null;
    }

    public async upsertChannel(
        channel: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = channel.id;
        if (!id) return;

        // 서버 응답의 부분 필드로 기존 캐시가 손실되지 않도록 병합 저장합니다.
        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const sid =
            (channel as { $?: { sid?: string } }).$?.sid ??
            (channel as { sid?: string }).sid ??
            existing?.sid ??
            context.sid ??
            '';

        const normalized = toDomainChannelBase(
            {
                ...(existing ?? {}),
                ...(channel as Record<string, unknown>),
                sid,
                cid: context.cid || this.getCid(contextOverride),
                isNotificationEnabled:
                    (channel as { isNotificationEnabled?: boolean }).isNotificationEnabled ??
                    existing?.isNotificationEnabled ??
                    true,
            } as Partial<DomainChannel>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid,
                uid: context.uid,
            }
        );

        const cacheItem: ChannelCache = normalized as ChannelCache;

        await this.cacheStorage.save(id, cacheItem);
        await this.emitAllStreams();
    }

    public async upsertChannels(
        channels: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(channels.map(channel => this.upsertChannel(channel, contextOverride)));
    }

    public async deleteChannel(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        await this.emitAllStreams();
    }

    public async deleteChannels(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
    }

    public async updateChannelPartial(
        id: string,
        patch: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.upsertChannel({ ...existing, ...patch }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        await this.emitAllStreams();
    }

    /** 로컬 채널 목록 스냅샷을 지속 구독합니다. */
    public subscribeChannelList(
        payload: ChatMinePayload,
        callback: LocalStreamCallback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchChannel(payload, contextOverride), callback);
    }

    /** 로컬 단일 채널 스냅샷을 지속 구독합니다. */
    public subscribeChannel(
        id: string,
        callback: LocalStreamCallback<DomainChannel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getChannel(id, contextOverride), callback);
    }

    /** 공통 CRUD 인터페이스: 리스트 조회 */
    public fetchList(
        query: ChatMinePayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        return this.fetchChannel(query, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 조회 */
    public getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainChannel | null> {
        return this.getChannel(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 저장 */
    public upsert(item: Partial<DomainChannel>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.upsertChannel(item, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 저장 */
    public upsertMany(
        items: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        return this.upsertChannels(items, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 삭제 */
    public remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteChannel(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 삭제 */
    public removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteChannels(ids, contextOverride);
    }

    /** 공통 Stream 인터페이스: 리스트 구독 */
    public subscribeList(
        query: ChatMinePayload,
        callback: LocalStreamCallback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeChannelList(query, callback, contextOverride);
    }

    /** 공통 Stream 인터페이스: 단건 구독 */
    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainChannel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeChannel(id, callback, contextOverride);
    }
}
