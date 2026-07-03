import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView, MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { DomainJoin, DomainListResult, DomainPlace, DomainUser } from '../../domain';
import { createDomainListResult, toDomainJoinFromUser, toDomainPlace, toDomainUser } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { UserDomainGateway } from '../gateways';

/**
 * Result of a channel user sync. Members arrive with their `$join` (read-state) embedded,
 * so we surface joins alongside users; `syncedAt` is the cursor for the next `since`, and
 * `ids` lists every currently-active member (for leave/kick detection).
 */
export interface ChannelUsersSyncResult {
    users: DomainUser[];
    joins: DomainJoin[];
    ids: string[];
    syncedAt: number;
}

/**
 * Result of a current-session profile fetch. `user.profile` returns a `UserProfile$` wrapper, so
 * we surface the mapped user alongside the embedded current site (`$site`) for the caller to cache
 * into the place store. `site` is null when the profile carries no site (e.g. on the default cloud).
 */
export interface UserProfileResult {
    user: DomainUser;
    site: DomainPlace | null;
}

export type UserFetchUsersInput = Parameters<UserDomainGateway['listUser']>[0];
export type UserUpdateProfilePayload = Parameters<UserDomainGateway['update']>[0];
export type UserRequestInviteInput = Parameters<UserDomainGateway['invite']>[0];
export type UserInviteBatchPayload = Parameters<UserDomainGateway['inviteBatch']>[0];
export type UserSyncChannelUsersInput = Parameters<UserDomainGateway['syncUsers']>[0];

export interface IUserRemoteDataSource {
    /** 특정 조건의 사용자 목록을 서버에 요청하고 도메인 모델로 반환합니다. */
    fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<DomainListResult<DomainUser>>;
    /** 현재 세션 본인 프로필을 요청하고, 도메인 user와 내장 $site(place)를 함께 반환합니다. (랠리·클라우드 공통) */
    getMyProfile(context: DataContext): Promise<UserProfileResult>;
    /** 내 프로필 정보 수정을 요청합니다. */
    updateProfile(payload: UserUpdateProfilePayload, context: DataContext): Promise<DomainUser>;
    /** 외부 사용자를 초대하고 초대 결과를 요청합니다. (도메인 user가 아닌 초대 뷰) */
    requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView>;
    /** 여러 사용자를 일괄 초대합니다. (도메인 user가 아닌 초대 뷰) */
    inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>>;
    /** 채널 멤버를 since 기준으로 동기화하고, 유저 + 내장 join + 커서(syncedAt)를 반환합니다. */
    syncChannelUsers(payload: UserSyncChannelUsersInput, context: DataContext): Promise<ChannelUsersSyncResult>;
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

    public async getMyProfile(context: DataContext): Promise<UserProfileResult> {
        const remote = ((await this.gateway.profile<UserProfile$>()) || {}) as UserProfile$;
        // user.profile returns a UserProfile$ wrapper: the user lives under `$user` and the current
        // site under `$site`. Fall back to the raw payload if it ever arrives as a flat user view.
        const userView = (remote.$user ?? (remote as unknown)) as UserView;
        const user = toDomainUser((userView || {}) as UserView, context);
        const site = remote.$site ? toDomainPlace(remote.$site as unknown as MySiteView, context) : null;
        return { user, site };
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
    ): Promise<ChannelUsersSyncResult> {
        const remote = await this.gateway.syncUsers<ChannelUsersSyncView>(payload);
        const rawList = remote?.list || [];
        const channelId = (payload as { channelId?: string }).channelId;

        const users = rawList.map(item => toDomainUser(item, context));
        // Each member carries its read-state in `$join`; surface it alongside the users.
        const joins = rawList
            .map(item => toDomainJoinFromUser(item, context, channelId))
            .filter((join): join is DomainJoin => !!join);

        return { users, joins, ids: remote?.ids || [], syncedAt: remote?.syncedAt || 0 };
    }
}
