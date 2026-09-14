import type { ChannelUsersSyncView, UserView } from '@lemoncloud/chatic-socials-api';
import type { ListResult } from '@lemoncloud/chatic-socials-api/dist/cores/types';
import type { MyInviteView, MySiteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { DomainJoin, DomainListResult, DomainPlace, DomainUser } from '../../domain';
import { createDomainListResult, toDomainJoinFromUser, toDomainPlace, toDomainUser } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { UserSocketDomainGateway } from '../gateways';

/**
 * Result of a channel user sync. Members arrive with their `$join` (read-state) embedded,
 * so we surface joins alongside users; `syncedAt` is the cursor for the next `since`, and
 * `ids` lists every currently-active member (for leave/kick detection).
 */
/**
 * Result of a channel roster fetch. The joins are harvested from the RAW views: `$join` is the
 * member's read-state for THIS channel, and a user record is global (one row per user id across
 * every channel), so the cursor has no place on it — it belongs in the join cache, keyed
 * `channelId@userId`. Mirrors ChannelUsersSyncResult, which already worked this way.
 */
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

/**
 * Result of a current-session profile fetch. `user.profile` returns a `UserProfile$` wrapper, so
 * we surface the mapped user alongside the embedded current site (`$site`) for the caller to cache
 * into the place store. `site` is null when the profile carries no site (e.g. on the default cloud).
 */
export interface UserProfileResult {
    user: DomainUser;
    site: DomainPlace | null;
}

export type UserFetchUsersInput = Parameters<UserSocketDomainGateway['listUser']>[0];
export type UserUpdateProfilePayload = Parameters<UserSocketDomainGateway['update']>[0];
export type UserRequestInviteInput = Parameters<UserSocketDomainGateway['invite']>[0];
export type UserInviteBatchPayload = Parameters<UserSocketDomainGateway['inviteBatch']>[0];
export type UserSyncChannelUsersInput = Parameters<UserSocketDomainGateway['syncUsers']>[0];

export interface IUserSocketDataSource {
    /** Requests a filtered user list and returns the domain users together with their embedded joins. */
    fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<ChannelUsersFetchResult>;
    /** Requests the current session's own profile and returns the domain user together with the embedded $site (place). (Relay and cloud alike.) */
    getMyProfile(context: DataContext): Promise<UserProfileResult>;
    /** Requests an edit to my own profile. */
    updateProfile(payload: UserUpdateProfilePayload, context: DataContext): Promise<DomainUser>;
    /** Invites an outside user and requests the invite result. (An invite view, not a domain user.) */
    requestInvite(payload: UserRequestInviteInput): Promise<MyInviteView>;
    /** Invites several users in one batch. (An invite view, not a domain user.) */
    inviteBatch(payload: UserInviteBatchPayload): Promise<ListResult<MyInviteView>>;
    /** Syncs channel members from `since` and returns the users, their embedded joins, and the cursor (`syncedAt`). */
    syncChannelUsers(payload: UserSyncChannelUsersInput, context: DataContext): Promise<ChannelUsersSyncResult>;
}

/**
 * User remote source. Single boundary where user API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 * Invite endpoints return invite views (not cached users) and stay raw.
 */
export class UserSocketDataSource implements IUserSocketDataSource {
    constructor(private readonly gateway: UserSocketDomainGateway) {}

    public async fetchUsers(payload: UserFetchUsersInput, context: DataContext): Promise<ChannelUsersFetchResult> {
        const remote = await this.gateway.listUser<ListResult<UserView>>(payload);
        const rawList = remote?.list || [];
        const channelId = (payload as { channelId?: string }).channelId;

        const list = rawList.map(item => toDomainUser(item, context));
        // Each member carries its read-state in `$join`; take it off the raw view, because
        // toDomainUser deliberately does not carry it onto the (global) user record.
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
