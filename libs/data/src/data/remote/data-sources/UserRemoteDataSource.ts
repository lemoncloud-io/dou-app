import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { UserDomainGateway } from '../gateways';

export type UserFetchUsersInput = Parameters<UserDomainGateway['listUser']>[0];
export type UserUpdateProfilePayload = Parameters<UserDomainGateway['update']>[0];
export type UserRequestInviteInput = Parameters<UserDomainGateway['invite']>[0];
export type UserInviteBatchPayload = Parameters<UserDomainGateway['inviteBatch']>[0];
export type UserSyncChannelUsersInput = Parameters<UserDomainGateway['syncUsers']>[0];

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청합니다. */
    fetchUsers(payload: UserFetchUsersInput): Promise<ListResult<UserView>>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfilePayload): Promise<UserView>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. */
    requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView>;
    /** 여러 사용자를 일괄 초대합니다. */
    inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>>;
    /** 채널 멤버 동기화를 요청합니다. */
    syncChannelUsers(payload: UserSyncChannelUsersInput): Promise<ChannelUsersSyncView>;
}

export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(private readonly gateway: UserDomainGateway) {}

    public async fetchUsers(payload: UserFetchUsersInput): Promise<ListResult<UserView>> {
        return this.gateway.listUser(payload);
    }

    public async updateProfile(payload: UserUpdateProfilePayload): Promise<UserView> {
        return this.gateway.update(payload);
    }

    public async requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView> {
        return this.gateway.invite(payload);
    }

    public async inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>> {
        return this.gateway.inviteBatch(payload);
    }

    public async syncChannelUsers(payload: UserSyncChannelUsersInput): Promise<ChannelUsersSyncView> {
        return this.gateway.syncUsers(payload);
    }
}
