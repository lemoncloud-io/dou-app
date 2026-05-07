import type { CacheCloudView } from '@chatic/app-messages';
import type { IInviteCloudLocalDataSource } from '../local/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';

/** InviteCloud Repository의 공개 계약입니다. */
export interface IInviteCloudRepository {
    /** 초대 cloud 정보를 로컬 저장소에 저장합니다. */
    saveInviteCloud(id: string, invite: Partial<CacheCloudView>): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInviteCloud(id: string): Promise<CacheCloudView | null>;

    /** 저장된 모든 초대 cloud 정보를 조회합니다. */
    getInviteClouds(): Promise<CacheCloudView[]>;

    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInviteCloud(id: string): Promise<void>;

    /** 다중 초대 cloud 정보를 삭제합니다. */
    deleteInviteClouds(ids: string[]): Promise<void>;

    /** 단일 초대 cloud 정보를 부분 업데이트합니다. */
    updateInviteCloudPartial(id: string, patch: Partial<CacheCloudView>): Promise<void>;

    /** 초대 cloud 로컬 저장소를 비웁니다. */
    clearAll(): Promise<void>;
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

    public saveInviteCloud(id: string, invite: Partial<CacheCloudView>): Promise<void> {
        return this.inviteCloudLocalDataSource.saveInviteCloud(id, invite);
    }

    public getInviteCloud(id: string): Promise<CacheCloudView | null> {
        return this.inviteCloudLocalDataSource.getInviteCloud(id);
    }

    public getInviteClouds(): Promise<CacheCloudView[]> {
        return this.inviteCloudLocalDataSource.getInviteClouds();
    }

    public deleteInviteCloud(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInviteCloud(id);
    }

    public deleteInviteClouds(ids: string[]): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInviteClouds(ids);
    }

    public updateInviteCloudPartial(id: string, patch: Partial<CacheCloudView>): Promise<void> {
        return this.inviteCloudLocalDataSource.updateInviteCloudPartial(id, patch);
    }

    public clearAll(): Promise<void> {
        return this.inviteCloudLocalDataSource.clearAll();
    }
}
