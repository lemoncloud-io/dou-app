import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type {
    ChannelSyncUsersInput,
    UserInviteBatchInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ChannelListUserInput } from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { UserDomainGateway } from '../gateways';

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: ChannelListUserInput): Promise<ListResult<UserView>>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfileInput): Promise<UserView>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. */
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    /** 여러 사용자를 일괄 초대합니다. */
    inviteBatch(payload: UserInviteBatchInput): Promise<ListResult<MyInviteView>>;
    /** 채널 멤버 동기화를 요청합니다. */
    syncChannelUsers(payload: ChannelSyncUsersInput): Promise<ChannelUsersSyncView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly gateway: UserDomainGateway
    ) {}

    public async fetchUsers(payload: ChannelListUserInput): Promise<ListResult<UserView>> {
        return this.gateway.listUser(payload);
    }

    public async updateProfile(payload: UserUpdateProfileInput): Promise<UserView> {
        return this.gateway.update(payload);
    }

    public async requestInvite(payload: UserInviteInput): Promise<MyInviteView> {
        return this.gateway.invite(payload);
    }

    public async inviteBatch(payload: UserInviteBatchInput): Promise<ListResult<MyInviteView>> {
        return this.gateway.inviteBatch(payload);
    }

    public async syncChannelUsers(payload: ChannelSyncUsersInput): Promise<ChannelUsersSyncView> {
        return this.gateway.syncUsers(payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `user:${action}` as 'user:create' | 'user:update' | 'user:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
