import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { DomainListResult, DomainUser } from '../../domain';
import { createDomainListResult, toDomainUser } from '../../domain';
import type { DataContext } from '../../repositories';
import type { UserDomainGateway } from '../gateways';

export type UserFetchUsersInput = Parameters<UserDomainGateway['listUser']>[0];
export type UserUpdateProfilePayload = Parameters<UserDomainGateway['update']>[0];
export type UserRequestInviteInput = Parameters<UserDomainGateway['invite']>[0];
export type UserInviteBatchPayload = Parameters<UserDomainGateway['inviteBatch']>[0];
export type UserSyncChannelUsersInput = Parameters<UserDomainGateway['syncUsers']>[0];

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청하고 도메인 모델로 반환합니다. */
    fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<DomainListResult<DomainUser>>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfilePayload, context: DataContext): Promise<DomainUser>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. (도메인 user가 아닌 초대 뷰) */
    requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView>;
    /** 여러 사용자를 일괄 초대합니다. (도메인 user가 아닌 초대 뷰) */
    inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>>;
    /** 채널 멤버 동기화를 요청하고 도메인 모델 목록으로 반환합니다. */
    syncChannelUsers(payload: UserSyncChannelUsersInput, context: DataContext): Promise<DomainListResult<DomainUser>>;
}

/**
 * User remote source. Single boundary where user API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 * Invite endpoints return invite views (not cached users) and stay raw.
 */
export class UserRemoteDataSource implements IUserRemoteDataSource {
    constructor(private readonly gateway: UserDomainGateway) {}

    public async fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<DomainListResult<DomainUser>> {
        const remote = await this.gateway.listUser<ListResult<UserView>>(payload);
        const list = (remote?.list || []).map(item => toDomainUser(item, context));
        return createDomainListResult(list, { total: remote?.total ?? list.length, source: 'remote' });
    }

    public async updateProfile(payload: UserUpdateProfilePayload, context: DataContext): Promise<DomainUser> {
        const remote = await this.gateway.update<UserView>(payload);
        return toDomainUser((remote || {}) as UserView, context);
    }

    public async requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView> {
        return this.gateway.invite(payload);
    }

    public async inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>> {
        return this.gateway.inviteBatch(payload);
    }

    public async syncChannelUsers(
        payload: UserSyncChannelUsersInput,
        context: DataContext
    ): Promise<DomainListResult<DomainUser>> {
        const remote = await this.gateway.syncUsers<ChannelUsersSyncView>(payload);
        const list = (remote?.list || []).map(item => toDomainUser(item, context));
        return createDomainListResult(list, { total: list.length, source: 'remote' });
    }
}
