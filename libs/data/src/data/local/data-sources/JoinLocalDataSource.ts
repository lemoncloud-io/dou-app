import type { JoinView } from '@lemoncloud/chatic-socials-api';
import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

export interface IJoinLocalDataSource {
    /** 단일 join 정보를 id로 조회합니다. */
    getJoin(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<JoinView | null>;
    /** 채널에 속한 join 목록을 조회합니다. */
    getJoinsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<JoinView[]>;
    /** 채널에 속한 활성(joined=1) join 목록만 조회합니다. */
    getActiveJoinsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<JoinView[]>;
    /** 단일 join 정보를 저장/병합합니다. */
    upsertJoin(join: JoinView, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 join 정보를 저장/병합합니다. */
    upsertJoins(joins: JoinView[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 join 정보를 삭제합니다. */
    deleteJoin(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** 채널 참여 정보 캐시 read/write를 담당합니다. */
export class JoinLocalDataSource extends BaseLocalDataSource implements IJoinLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'join'>
    ) {
        super(contextProvider);
    }

    public async getJoin(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<JoinView | null> {
        const item = await this.cacheStorage.load(id);
        return item ? { ...item } : null;
    }

    public async getJoinsByChannel(
        channelId: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<JoinView[]> {
        if (!channelId) return [];
        const joins = await this.cacheStorage.loadAll();
        return joins.filter(join => join.channelId === channelId).map(join => ({ ...join }));
    }

    public async getActiveJoinsByChannel(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<JoinView[]> {
        const joins = await this.getJoinsByChannel(channelId, contextOverride);
        return joins.filter(join => join.joined === 1 || join.joined === undefined);
    }

    public async upsertJoin(join: JoinView, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const id = join.id;
        if (!id) return;

        const cacheItem: CacheStorageItem<'join'> = {
            ...join,
            cid: this.getCid(contextOverride),
        };
        await this.cacheStorage.save(id, cacheItem);
    }

    public async upsertJoins(joins: JoinView[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await Promise.all(joins.map(join => this.upsertJoin(join, contextOverride)));
    }

    public async deleteJoin(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }
}
