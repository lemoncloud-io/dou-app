import type { IInviteCloudLocalDataSource } from '../local/data-sources';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import { createDomainListResult, type DomainInviteCloud, type DomainListResult } from '../domain';

/** InviteCloud Repository의 공개 계약입니다. */
export interface IInviteCloudRepository extends ILocalCacheMutationRepository<DomainInviteCloud> {
    /** 초대 cloud 정보를 로컬 저장소에 저장합니다. */
    saveInviteCloud(id: string, invite: Partial<DomainInviteCloud>): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInviteCloud(id: string): Promise<DomainInviteCloud | null>;

    /** 저장된 모든 초대 cloud 정보를 조회합니다. */
    getInviteClouds(): Promise<DomainListResult<DomainInviteCloud>>;

    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInviteCloud(id: string): Promise<void>;

    /** 다중 초대 cloud 정보를 삭제합니다. */
    deleteInviteClouds(ids: string[]): Promise<void>;

    /** 단일 초대 cloud 정보를 부분 업데이트합니다. */
    updateInviteCloudPartial(id: string, patch: Partial<DomainInviteCloud>): Promise<void>;

    /** 초대 cloud 로컬 저장소를 비웁니다. */
    clearAll(): Promise<void>;

    // --- 통합 스트림 인터페이스 ---
    /** 초대 cloud 전체 목록을 스트림으로 구독합니다. */
    subscribeList(callback: (result: DomainListResult<DomainInviteCloud> | null) => void): () => void;

    /** 단일 초대 cloud를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (invite: DomainInviteCloud | null) => void): () => void;
}

/** InviteCloud는 remote endpoint가 없으므로 LocalDataSource만 위임합니다. */
export class InviteCloudRepository extends BaseRepository implements IInviteCloudRepository {
    constructor(
        private readonly inviteCloudLocalDataSource: IInviteCloudLocalDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public saveInviteCloud(id: string, invite: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.upsert({ ...invite, id }, this.getRepositoryContext());
    }

    public getInviteCloud(id: string): Promise<DomainInviteCloud | null> {
        return this.inviteCloudLocalDataSource.getById(
            id,
            this.getRepositoryContext()
        ) as Promise<DomainInviteCloud | null>;
    }

    public async getInviteClouds(): Promise<DomainListResult<DomainInviteCloud>> {
        const result = await this.inviteCloudLocalDataSource.fetchList(undefined, this.getRepositoryContext());
        return (
            (result as DomainListResult<DomainInviteCloud>) || createDomainListResult([], { total: 0, source: 'local' })
        );
    }

    public deleteInviteCloud(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public deleteInviteClouds(ids: string[]): Promise<void> {
        return this.inviteCloudLocalDataSource.removeMany(ids, this.getRepositoryContext());
    }

    public updateInviteCloudPartial(id: string, patch: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public clearAll(): Promise<void> {
        return this.inviteCloudLocalDataSource.clearAll(this.getRepositoryContext());
    }

    // --- 스트림 인터페이스 ---
    public subscribeList(callback: (result: DomainListResult<DomainInviteCloud> | null) => void): () => void {
        return this.inviteCloudLocalDataSource.subscribeList(undefined, callback as any, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (invite: DomainInviteCloud | null) => void): () => void {
        return this.inviteCloudLocalDataSource.subscribeItem(id, callback as any, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainInviteCloud>>): Promise<void> {
        return this.inviteCloudLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainInviteCloud>>): Promise<void> {
        await this.inviteCloudLocalDataSource.upsertMany(
            items.map(it => ({ id: it.id, ...it.patch })),
            this.getRepositoryContext()
        );
    }
}
