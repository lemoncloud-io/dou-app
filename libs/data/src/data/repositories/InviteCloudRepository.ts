import type { IInviteCloudLocalDataSource } from '../local/data-sources';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DomainInviteCloud } from '../domain';

/** InviteCloud Repository의 공개 계약입니다. */
export interface IInviteCloudRepository extends ILocalCacheMutationRepository<DomainInviteCloud> {
    /** 초대 cloud 정보를 로컬 저장소에 저장합니다. */
    saveInviteCloud(id: string, invite: Partial<DomainInviteCloud>): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInviteCloud(id: string): Promise<DomainInviteCloud | null>;

    /** 저장된 모든 초대 cloud 정보를 조회합니다. */
    getInviteClouds(): Promise<DomainInviteCloud[]>;

    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInviteCloud(id: string): Promise<void>;

    /** 다중 초대 cloud 정보를 삭제합니다. */
    deleteInviteClouds(ids: string[]): Promise<void>;

    /** 단일 초대 cloud 정보를 부분 업데이트합니다. */
    updateInviteCloudPartial(id: string, patch: Partial<DomainInviteCloud>): Promise<void>;

    /** 초대 cloud 로컬 저장소를 비웁니다. */
    clearAll(): Promise<void>;

    /** 초대 cloud 전체 목록을 스트림으로 구독합니다. */
    subscribeInviteClouds(callback: (invites: DomainInviteCloud[]) => void): () => void;

    /** 단일 초대 cloud를 스트림으로 구독합니다. */
    subscribeInviteCloud(id: string, callback: (invite: DomainInviteCloud | null) => void): () => void;
}

/** InviteCloud는 remote endpoint가 없으므로 LocalDataSource만 위임합니다. */
export class InviteCloudRepository extends BaseRepository implements IInviteCloudRepository {
    constructor(
        private readonly inviteCloudLocalDataSource: IInviteCloudLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
    }

    public saveInviteCloud(id: string, invite: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.saveInviteCloud(id, invite);
    }

    public getInviteCloud(id: string): Promise<DomainInviteCloud | null> {
        return this.inviteCloudLocalDataSource.getInviteCloud(id);
    }

    public getInviteClouds(): Promise<DomainInviteCloud[]> {
        return this.inviteCloudLocalDataSource.getInviteClouds();
    }

    public deleteInviteCloud(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInviteCloud(id);
    }

    public deleteInviteClouds(ids: string[]): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInviteClouds(ids);
    }

    public updateInviteCloudPartial(id: string, patch: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.updateInviteCloudPartial(id, patch);
    }

    public clearAll(): Promise<void> {
        return this.inviteCloudLocalDataSource.clearAll();
    }

    /** 로컬 초대 cloud 목록 스냅샷을 지속 구독합니다. */
    public subscribeInviteClouds(callback: (invites: DomainInviteCloud[]) => void): () => void {
        return this.inviteCloudLocalDataSource.subscribeInviteClouds(callback);
    }

    /** 로컬 단일 초대 cloud 스냅샷을 지속 구독합니다. */
    public subscribeInviteCloud(id: string, callback: (invite: DomainInviteCloud | null) => void): () => void {
        return this.inviteCloudLocalDataSource.subscribeInviteCloud(id, callback);
    }

    /** 로컬 캐시에 초대 cloud를 생성/병합합니다. (remote 호출 없음) */
    public cacheCreate(item: Partial<DomainInviteCloud>): Promise<void> {
        const id = item.id || '';
        return this.inviteCloudLocalDataSource.saveInviteCloud(id, item);
    }

    /** 로컬 캐시의 초대 cloud 일부 필드를 갱신합니다. (remote 호출 없음) */
    public cacheUpdate(id: string, patch: Partial<DomainInviteCloud>): Promise<void> {
        return this.inviteCloudLocalDataSource.updateInviteCloudPartial(id, patch);
    }

    /** 로컬 캐시에서 초대 cloud를 삭제합니다. (remote 호출 없음) */
    public cacheDelete(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInviteCloud(id);
    }

    /** 로컬 캐시에 초대 cloud를 일괄 생성/병합합니다. (remote 호출 없음) */
    public async cacheBulkCreate(items: Array<Partial<DomainInviteCloud>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item => this.inviteCloudLocalDataSource.saveInviteCloud(item.id || '', item))
        );
    }

    /** 로컬 캐시의 초대 cloud 일부 필드를 일괄 갱신합니다. (remote 호출 없음) */
    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainInviteCloud>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item => this.inviteCloudLocalDataSource.updateInviteCloudPartial(item.id, item.patch))
        );
    }
}
