import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { MyInviteView, MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { PlaceListUserResult } from '@lemoncloud/chatic-sockets-api/dist/lib/place/types';
import type { UserListDeviceView, UserUnlinkDeviceView } from '@lemoncloud/chatic-sockets-lib';
import type { DomainJoin, DomainListResult, DomainPlace, DomainPlaceMember, DomainUser } from '../../domain';
import {
    createDomainListResult,
    toDomainJoinFromUser,
    toDomainPlace,
    toDomainPlaceMember,
    toDomainUser,
} from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { UserSocketDomainGateway } from '../gateways';

export interface ChannelUsersFetchResult {
    users: DomainListResult<DomainUser>;
    joins: DomainJoin[];
}

export interface ChannelUsersSyncResult {
    users: DomainUser[];
    joins: DomainJoin[];
    ids: string[];
    syncedAt: number;
}

export interface UserProfileResult {
    user: DomainUser;
    site: DomainPlace | null;
}

export interface PlaceUsersPage {
    members: DomainPlaceMember[];
    total: number;
    page: number;
    limit: number;
}

export type UserFetchUsersInput = Parameters<UserSocketDomainGateway['listUser']>[0];
export type UserUpdateProfilePayload = Parameters<UserSocketDomainGateway['update']>[0];
export type UserRequestInviteInput = Parameters<UserSocketDomainGateway['invite']>[0];
export type UserInviteBatchPayload = Parameters<UserSocketDomainGateway['inviteBatch']>[0];
export type UserSyncChannelUsersInput = Parameters<UserSocketDomainGateway['syncUsers']>[0];
export type UserFetchPlaceUsersInput = Parameters<UserSocketDomainGateway['listPlaceUser']>[0];

export interface IUserSocketDataSource {
    fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<ChannelUsersFetchResult>;
    getMyProfile(context: DataContext): Promise<UserProfileResult>;
    updateProfile(payload: UserUpdateProfilePayload, context: DataContext): Promise<DomainUser>;
    requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView>;
    inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>>;
    syncChannelUsers(payload: UserSyncChannelUsersInput, context: DataContext): Promise<ChannelUsersSyncResult>;
    fetchPlaceUsers(payload: UserFetchPlaceUsersInput, context: DataContext): Promise<PlaceUsersPage>;
    listDevices(): Promise<UserListDeviceView>;
    unlinkDevice(deviceId: string): Promise<UserUnlinkDeviceView>;
}

export class UserSocketDataSource implements IUserSocketDataSource {
    constructor(private readonly gateway: UserSocketDomainGateway) {}

    public async fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<ChannelUsersFetchResult> {
        const remote = await this.gateway.listUser<ListResult<UserView>>(payload);
        const rawList = remote?.list || [];
        const channelId = (payload as { channelId?: string }).channelId;

        const list = rawList.map(item => toDomainUser(item, context));
        const joins = rawList
            .map(item => toDomainJoinFromUser(item, context, channelId))
            .filter((join): join is DomainJoin => !!join);

        return {
            users: createDomainListResult(list, { total: remote?.total ?? list.length, source: 'remote' }),
            joins,
        };
    }

    public async getMyProfile(context: DataContext): Promise<UserProfileResult> {
        const remote = ((await this.gateway.profile<UserProfile$>()) || {}) as UserProfile$;
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
        const joins = rawList
            .map(item => toDomainJoinFromUser(item, context, channelId))
            .filter((join): join is DomainJoin => !!join);

        return { users, joins, ids: remote?.ids || [], syncedAt: remote?.syncedAt || 0 };
    }

    public async fetchPlaceUsers(payload: UserFetchPlaceUsersInput, context: DataContext): Promise<PlaceUsersPage> {
        const remote = await this.gateway.listPlaceUser<PlaceListUserResult>(payload);
        const members = (remote?.list || []).filter(item => !!item?.id).map(item => toDomainPlaceMember(item, context));
        return {
            members,
            total: typeof remote?.total === 'number' ? remote.total : Number.POSITIVE_INFINITY,
            page: typeof remote?.page === 'number' ? remote.page : (payload.page ?? 0),
            limit: typeof remote?.limit === 'number' ? remote.limit : (payload.limit ?? members.length),
        };
    }

    public async listDevices(): Promise<UserListDeviceView> {
        return this.gateway.listDevice();
    }

    public async unlinkDevice(deviceId: string): Promise<UserUnlinkDeviceView> {
        return this.gateway.unlinkDevice({ deviceId });
    }
}
