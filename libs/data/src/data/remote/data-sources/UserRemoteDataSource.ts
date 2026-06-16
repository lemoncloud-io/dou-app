import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type {
    ChannelSyncSiteProfileInput,
    ChannelSyncUsersInput,
    UserGetSiteProfileInput,
    UserInviteBatchInput,
    UserInviteInput,
    UserSetSiteProfileInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { ChannelUsersSyncView, ProfileView, SiteProfileSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ChannelListUserInput } from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: ChannelListUserInput): Promise<ListResult<UserView>>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfileInput): Promise<UserView>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. */
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    /** 여러 사용자를 일괄 초대합니다. */
    inviteBatch(payload: UserInviteBatchInput): Promise<ListResult<MyInviteView>>;
    /** 사이트 프로필 조회를 요청합니다. */
    getSiteProfile(payload: UserGetSiteProfileInput): Promise<ProfileView>;
    /** 사이트 프로필 설정을 요청합니다. */
    setSiteProfile(payload: UserSetSiteProfileInput): Promise<ProfileView>;
    /** 채널 멤버 동기화를 요청합니다. */
    syncChannelUsers(payload: ChannelSyncUsersInput): Promise<ChannelUsersSyncView>;
    /** 사이트 프로필 변경분 동기화를 요청합니다. */
    syncSiteProfile(payload: ChannelSyncSiteProfileInput): Promise<SiteProfileSyncView>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async fetchUsers(payload: ChannelListUserInput): Promise<ListResult<UserView>> {
        return this.client.request('channel.list-user', payload);
    }

    public async updateProfile(payload: UserUpdateProfileInput): Promise<UserView> {
        return this.client.request('user.update-profile', payload);
    }

    public async requestInvite(payload: UserInviteInput): Promise<MyInviteView> {
        return this.client.request('user.invite', payload);
    }

    public async inviteBatch(payload: UserInviteBatchInput): Promise<ListResult<MyInviteView>> {
        return this.client.request('user.invite-batch', payload);
    }

    public async getSiteProfile(payload: UserGetSiteProfileInput): Promise<ProfileView> {
        return this.client.request('user.get-site-profile', payload);
    }

    public async setSiteProfile(payload: UserSetSiteProfileInput): Promise<ProfileView> {
        return this.client.request('user.set-site-profile', payload);
    }

    public async syncChannelUsers(payload: ChannelSyncUsersInput): Promise<ChannelUsersSyncView> {
        return this.client.request('channel.sync-users', payload);
    }

    public async syncSiteProfile(payload: ChannelSyncSiteProfileInput): Promise<SiteProfileSyncView> {
        return this.client.request('channel.sync-site-profile', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `user:${action}` as 'user:create' | 'user:update' | 'user:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
