import type { ChatMinePayload } from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../../events/types';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { CacheStorage, CacheStorageItem } from '../storages';
import type { DataContextProvider } from '../../repositories';
import { toDomainChannel } from './mappers';
import type { DomainChannel } from '../../domain';
import { toDomainChannel as toDomainChannelBase } from '../../domain';

export interface IChannelLocalDataSource {
    /** 채널 목록을 로컬 캐시에서 조회하고 payload 기준으로 정렬/페이지네이션합니다. */
    fetchChannel(
        payload: ChatMinePayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<DomainChannel> | null>;
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
    ): Promise<ListResult<DomainChannel> | null> {
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

        return {
            list: list.map(toDomainChannel),
            total: scopedChannels.length,
            limit,
            page,
        };
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
    }

    public async deleteChannels(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
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
    }
}
