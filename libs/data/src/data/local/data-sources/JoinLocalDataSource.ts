import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainJoin } from './mappers';
import {
    createDomainListResult,
    type DomainJoin,
    type DomainJoinListPayload,
    type DomainListResult,
} from '../../domain';
import { toDomainJoin as toDomainJoinBase } from '../../domain';

export interface IJoinLocalDataSource
    extends ICrudLocalDataSource<DomainJoin>,
        IListLocalDataSource<DomainJoin, DomainJoinListPayload, DomainListResult<DomainJoin>>,
        IStreamLocalDataSource<DomainJoin, DomainJoinListPayload, DomainListResult<DomainJoin>> {}

/** 채널 참여 정보 캐시 read/write를 담당합니다. */
export class JoinLocalDataSource extends BaseLocalDataSource implements IJoinLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'join'>
    ) {
        super(contextProvider);
    }

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainJoin(item) : null;
    }

    public async upsert(
        join: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceContextOverride,
        emitStream = true
    ): Promise<void> {
        const id = join.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const normalized = toDomainJoinBase(
            {
                ...(existing ?? {}),
                ...(join as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainJoin>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );

        const cacheItem: CacheStorageItem<'join'> = normalized as CacheStorageItem<'join'>;
        await this.cacheStorage.save(id, cacheItem);
        if (emitStream) {
            this.debouncedEmitAllStreams();
        }
    }

    public async upsertMany(
        joins: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (joins.length === 0) return;

        // 다중 데이터 저장 시 브릿지 통신(saveAll) 최적화
        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const baseScope = { cid, sid: context.sid, uid: context.uid };

        const existingItems = await Promise.all(joins.map(join => (join.id ? this.cacheStorage.load(join.id) : null)));

        const cacheItemsToSave: CacheStorageItem<'join'>[] = [];
        joins.forEach((join, index) => {
            if (!join.id) return;
            const existing = existingItems[index];
            const normalized = toDomainJoinBase(
                {
                    ...(existing ?? {}),
                    ...(join as Record<string, unknown>),
                    cid,
                } as Partial<DomainJoin>,
                baseScope
            );
            cacheItemsToSave.push(normalized as CacheStorageItem<'join'>);
        });

        if (cacheItemsToSave.length > 0) {
            await this.cacheStorage.saveAll(cacheItemsToSave);
            this.debouncedEmitAllStreams();
        }
    }

    public async remove(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        this.debouncedEmitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.debouncedEmitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.debouncedEmitAllStreams();
    }

    // =========================================================================
    // 2. 공통 List 인터페이스 (IListLocalDataSource)
    // =========================================================================

    public async fetchList(
        query: DomainJoinListPayload,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainJoin> | null> {
        const channelId = query?.channelId;

        //  channelId가 없을 때 null 대신 빈 배열 반환
        if (!channelId) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const allJoins = await this.cacheStorage.loadAll();
        let joins = allJoins.map(toDomainJoin).filter(join => join.channelId === channelId);

        // query의 activeOnly 필터링 조건 적용
        if (query.activeOnly) {
            joins = joins.filter(join => join.joined === 1 || join.joined === undefined);
        }

        //  조회된 데이터가 없을 때 빈 배열 반환
        if (joins.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        return createDomainListResult(joins, {
            total: joins.length,
            source: 'local',
        });
    }

    // =========================================================================
    // 3. 공통 Stream 인터페이스 (IStreamLocalDataSource)
    // =========================================================================

    public subscribeList(
        query: DomainJoinListPayload,
        callback: LocalStreamCallback<DomainListResult<DomainJoin> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(query, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainJoin | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
