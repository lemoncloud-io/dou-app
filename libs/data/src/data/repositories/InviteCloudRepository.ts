import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { IInviteCloudLocalDataSource } from '../local/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';

type InviteCloudCache = MyInviteView & { id: string; cid: string; name?: string; backend?: string; wss?: string };

/** InviteCloud Repository의 공개 계약입니다. */
export interface IInviteCloudRepository {
    /** 초대 cloud 정보를 로컬 저장소에 저장합니다. */
    saveInvite(id: string, invite: InviteCloudCache): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInvite(id: string): Promise<InviteCloudCache | null>;

    /** 저장된 모든 초대 cloud 정보를 조회합니다. */
    getInvites(): Promise<InviteCloudCache[]>;

    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInvite(id: string): Promise<void>;

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

    public saveInvite(id: string, invite: InviteCloudCache): Promise<void> {
        return this.inviteCloudLocalDataSource.saveInvite(id, invite);
    }

    public getInvite(id: string): Promise<InviteCloudCache | null> {
        return this.inviteCloudLocalDataSource.getInvite(id);
    }

    public getInvites(): Promise<InviteCloudCache[]> {
        return this.inviteCloudLocalDataSource.getInvites();
    }

    public deleteInvite(id: string): Promise<void> {
        return this.inviteCloudLocalDataSource.deleteInvite(id);
    }

    public clearAll(): Promise<void> {
        return this.inviteCloudLocalDataSource.clearAll();
    }
}
