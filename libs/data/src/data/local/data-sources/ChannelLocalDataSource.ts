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
import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainChannel as toDomainChannelBase } from '../../domain';

type ChannelCache = CacheStorageItem<'channel'>;

const getChannelSortTime = (channel: Partial<DomainChannel> | ChannelCache): number => {
    const lastChatCreatedAt = (channel as any).lastChat$?.createdAt;
    const updatedAt = (channel as any).updatedAt;
    const value = lastChatCreatedAt ?? updatedAt ?? 0;
    return typeof value === 'number' ? value : new Date(value).getTime();
};

export interface IChannelLocalDataSource
    extends ICrudLocalDataSource<DomainChannel>,
        IListLocalDataSource<DomainChannel, DomainChannelListPayload>,
        IStreamLocalDataSource<DomainChannel, DomainChannelListPayload, DomainListResult<DomainChannel>> {}

export class ChannelLocalDataSource extends BaseLocalDataSource implements IChannelLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'channel'>
    ) {
        super(contextProvider);
    }

    // --- CRUD ---
    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainChannel | null> {
        const item = await this.cacheStorage.load(id);
        return item ? (item as unknown as DomainChannel) : null;
    }

    public async upsert(
        channel: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = channel.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const sid = (channel as any).$?.sid || channel.sid || existing?.sid || context.sid || 'default';

        const normalized = toDomainChannelBase(
            {
                ...(existing ?? {}),
                ...(channel as Record<string, unknown>),
                sid,
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainChannel>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid,
                uid: context.uid,
            }
        );

        await this.cacheStorage.save(id, normalized as unknown as ChannelCache);
        await this.emitAllStreams();
    }

    public async upsertMany(
        channels: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(channels.map(channel => this.upsert(channel, contextOverride)));
    }

    public async remove(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        await this.emitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        await this.emitAllStreams();
    }

    // --- List & Stream ---
    public async fetchList(
        payload: DomainChannelListPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        const context = this.getContext(contextOverride);
        const allChannels = await this.cacheStorage.loadAll();
        const placeId = payload.sid ?? context.sid;
        const scopedChannels = placeId ? allChannels.filter(channel => channel.sid === placeId) : allChannels;

        if (scopedChannels.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const sorted = [...scopedChannels].sort((left, right) => getChannelSortTime(right) - getChannelSortTime(left));
        const limit = payload.limit;
        const page = payload.page ?? 0;
        const start = limit ? page * limit : 0;
        const list = limit ? sorted.slice(start, start + limit) : sorted;

        return createDomainListResult(list as unknown as DomainChannel[], {
            total: scopedChannels.length,
            limit,
            page,
            source: 'local',
        });
    }

    public subscribeList(
        query: DomainChannelListPayload,
        callback: LocalStreamCallback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(query, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainChannel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
