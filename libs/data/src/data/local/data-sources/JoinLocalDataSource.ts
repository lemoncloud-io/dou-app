import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainJoin } from './mappers';
import type { DomainJoin } from '../../domain';
import { toDomainJoin as toDomainJoinBase } from '../../domain';

export interface IJoinLocalDataSource {
    /** 단일 join 정보를 id로 조회합니다. */
    getJoin(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin | null>;
    /** 채널에 속한 join 목록을 조회합니다. */
    getJoinsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin[]>;
    /** 채널에 속한 활성(joined=1) join 목록만 조회합니다. */
    getActiveJoinsByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin[]>;
    /** 단일 join 정보를 저장/병합합니다. */
    upsertJoin(join: Partial<DomainJoin>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 join 정보를 저장/병합합니다. */
    upsertJoins(joins: Array<Partial<DomainJoin>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 join 정보를 삭제합니다. */
    deleteJoin(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다중 join 정보를 삭제합니다. */
    deleteJoins(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 join 일부 필드만 병합 업데이트합니다. */
    updateJoinPartial(
        id: string,
        patch: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
    /** 현재 스코프의 join 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** 채널 참여 정보 캐시 read/write를 담당합니다. */
export class JoinLocalDataSource extends BaseLocalDataSource implements IJoinLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'join'>
    ) {
        super(contextProvider);
    }

    public async getJoin(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin | null> {
        const item = await this.cacheStorage.load(id);
        return item ? toDomainJoin(item) : null;
    }

    public async getJoinsByChannel(
        channelId: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainJoin[]> {
        if (!channelId) return [];
        const joins = await this.cacheStorage.loadAll();
        return joins.map(toDomainJoin).filter(join => join.channelId === channelId);
    }

    public async getActiveJoinsByChannel(
        channelId: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainJoin[]> {
        const joins = await this.getJoinsByChannel(channelId, contextOverride);
        return joins.filter(join => join.joined === 1 || join.joined === undefined);
    }

    public async upsertJoin(
        join: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceContextOverride
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
    }

    public async upsertJoins(
        joins: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (joins.length === 0) return;

        // 다중 데이터 저장 시 브릿지 통신(saveAll) 최적화
        // 개별 upsertJoin 호출로 인한 다수의 브릿지 횡단을 방지하고 메모리에서 병합 후 일괄 처리합니다.
        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const baseScope = { cid, sid: context.sid, uid: context.uid };

        //  병합을 위해 기존 캐시 데이터 일괄 로드
        const existingItems = await Promise.all(joins.map(join => (join.id ? this.cacheStorage.load(join.id) : null)));

        // 메모리 상에서 정규화 및 병합 수행
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
        }
    }

    public async deleteJoin(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async deleteJoins(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
    }

    public async updateJoinPartial(
        id: string,
        patch: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;

        await this.upsertJoin({ ...(existing as unknown as DomainJoin), ...patch }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }
}
