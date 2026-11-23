import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { UserListDeviceView, UserUnlinkDeviceView } from '@lemoncloud/chatic-sockets-lib';
import type { DomainListResult, DomainPlaceMember, DomainUser } from '../domain';
import type { IJoinLocalDataSource, IPlaceLocalDataSource, IUserLocalDataSource } from '../local/data-sources';
import type { IUserSocketDataSource, UserInviteBatchPayload } from '../remote/socket-data-sources';
import type { AdminEndpointOptions, IUserHttpDataSource } from '../remote/http-data-sources';
import type { IProfileRepository } from './ProfileRepository';
import { isForeignContext } from './scopeGuards';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

const PLACE_MEMBER_PAGE_SIZE = 10;

export interface PlaceMembersQuery {
    placeId: string;
    sessionPlaceId: string | null;
    pageSize?: number;
}

export interface PlaceMembersResult {
    members: DomainPlaceMember[];
    context: { cid: string; sid: string };
    profiles: 'loaded' | 'skipped' | 'failed';
}

export interface UserRepositoryOptions {
    persistEmbeddedSite?: (context: DataContext) => boolean;
}

export interface IUserRepository extends DisposableRepository {
    observeList(query: ChatUsersInput, callback: (result: DomainListResult<DomainUser> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainUser | null) => void): () => void;

    getMyProfile(): Promise<DomainUser>;
    updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser>;
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    requestInviteBatch(payload: UserInviteBatchPayload): Promise<MyInviteView[]>;
    syncChannelUsers(payload: ChannelSyncUsersInput): Promise<number>;
    refreshList(query: ChatUsersInput): Promise<void>;
    listPlaceMembers(query: PlaceMembersQuery): Promise<PlaceMembersResult>;
    listDevices(): Promise<UserListDeviceView>;
    unlinkDevice(deviceId: string): Promise<UserUnlinkDeviceView>;

    cacheRead(id: string): Promise<DomainUser | null>;
    cacheReadList(query: ChatUsersInput): Promise<DomainListResult<DomainUser> | null>;
    cacheWrite(item: Partial<DomainUser>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainUser>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;

    listRelayUsers(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<DomainListResult<DomainUser>>;
    tryFetchProfile(): Promise<UserProfile$>;
}

export class UserRepository extends BaseRepository implements IUserRepository {
    constructor(
        private readonly userSocketDataSource: IUserSocketDataSource,
        private readonly userLocalDataSource: IUserLocalDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        private readonly placeLocalDataSource: IPlaceLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly options?: UserRepositoryOptions,
        private readonly userHttpDataSource?: IUserHttpDataSource,
        private readonly profileRepository?: Pick<IProfileRepository, 'syncProfilesOf'>
    ) {
        super(contextProvider);
    }

    private requireHttp(): IUserHttpDataSource {
        if (!this.userHttpDataSource) {
            throw new Error('[UserRepository] IUserHttpDataSource is not injected — httpFactory not wired yet.');
        }
        return this.userHttpDataSource;
    }

    public async listRelayUsers(
        params?: Record<string, unknown>,
        opts?: AdminEndpointOptions
    ): Promise<DomainListResult<DomainUser>> {
        return this.requireHttp().listRelayUsers(params, this.getRequestContext(), opts);
    }

    public async tryFetchProfile(): Promise<UserProfile$> {
        return this.requireHttp().tryFetchProfile();
    }

    public observeList(
        query: ChatUsersInput,
        callback: (result: DomainListResult<DomainUser> | null) => void
    ): () => void {
        return this.userLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainUser | null) => void): () => void {
        return this.userLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainUser | null> {
        return this.userLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query: ChatUsersInput): Promise<DomainListResult<DomainUser> | null> {
        return this.userLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainUser>): Promise<void> {
        return this.userLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainUser>>): Promise<void> {
        return this.userLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.userLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.userLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshList(query: ChatUsersInput): Promise<void> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const { users, joins } = await this.userSocketDataSource.fetchUsers(
            {
                ...query,
                detail: true,
            },
            normalizedContext
        );
        await this.userLocalDataSource.cacheWriteMany(users.list || [], requestContext);

        if (joins.length > 0) {
            await this.joinLocalDataSource.cacheWriteMany(joins, requestContext);
        }
    }

    public async getMyProfile(): Promise<DomainUser> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const { user, site } = await this.userSocketDataSource.getMyProfile(normalizedContext);

        await this.userLocalDataSource.cacheWrite(user, requestContext);
        if (site && (this.options?.persistEmbeddedSite?.(requestContext) ?? true)) {
            await this.placeLocalDataSource.cacheWrite(site, requestContext);
        }
        return user;
    }

    public async updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser> {
        const uid = (payload as { id?: string; userId?: string }).id || (payload as { userId?: string }).userId || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = uid ? await this.userLocalDataSource.cacheRead(uid, requestContext) : null;
        if (uid) {
            await this.userLocalDataSource.cacheWrite({ id: uid, ...(payload as Partial<DomainUser>) }, requestContext);
        }
        try {
            const domain = await this.userSocketDataSource.updateProfile(payload, normalizedContext);
            await this.userLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                await this.userLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public requestInvite(payload: UserInviteInput): Promise<MyInviteView> {
        return this.userSocketDataSource.requestInvite(payload);
    }

    public async requestInviteBatch(payload: UserInviteBatchPayload): Promise<MyInviteView[]> {
        const result = await this.userSocketDataSource.inviteBatch(payload);
        return result.list || [];
    }

    public listDevices(): Promise<UserListDeviceView> {
        return this.userSocketDataSource.listDevices();
    }

    public unlinkDevice(deviceId: string): Promise<UserUnlinkDeviceView> {
        return this.userSocketDataSource.unlinkDevice(deviceId);
    }

    public async syncChannelUsers(payload: ChannelSyncUsersInput): Promise<number> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.userSocketDataSource.syncChannelUsers(payload, normalizedContext);

        await this.userLocalDataSource.cacheWriteMany(remote.users, requestContext);
        if (remote.joins.length > 0) {
            await this.joinLocalDataSource.cacheWriteMany(remote.joins, requestContext);
        }

        return remote.syncedAt;
    }

    public async listPlaceMembers({
        placeId,
        sessionPlaceId,
        pageSize = PLACE_MEMBER_PAGE_SIZE,
    }: PlaceMembersQuery): Promise<PlaceMembersResult> {
        const sid = this.assertRequiredString(placeId, 'placeId');
        const requestContext = this.getRequestContext();
        if (isForeignContext(requestContext)) {
            throw new Error('[UserRepository] place.list-user: the socket is still on another cloud');
        }
        const normalizedContext = this.getNormalizedContext(requestContext);
        const cid = normalizedContext.cid || 'default';
        const loadProfiles = !!this.profileRepository && sessionPlaceId === sid;
        const stillInScope = () => {
            const current = this.getRepositoryContext();
            return (current.cid || 'default') === cid && !isForeignContext(current);
        };
        let skippedAfterMove = false;
        const profileLoads: Array<Promise<unknown>> = [];

        const byId = new Map<string, DomainPlaceMember>();
        for (let page = 0; ; page += 1) {
            const answer = await this.userSocketDataSource.fetchPlaceUsers(
                { id: sid, page, limit: pageSize },
                normalizedContext
            );
            if (answer.members.length === 0) break;

            const fresh = answer.members.filter(member => !byId.has(member.id));
            fresh.forEach(member => byId.set(member.id, member));

            if (loadProfiles && fresh.length > 0) {
                if (stillInScope()) {
                    profileLoads.push(
                        this.profileRepository!.syncProfilesOf(
                            fresh.map(member => member.id),
                            sid
                        )
                    );
                } else {
                    skippedAfterMove = true;
                }
            }

            if (fresh.length === 0) break;
            const limit = answer.limit > 0 ? answer.limit : pageSize;
            if ((page + 1) * limit >= answer.total) break;
        }

        const settled = await Promise.allSettled(profileLoads);
        const profiles: PlaceMembersResult['profiles'] = !loadProfiles
            ? 'skipped'
            : settled.some(result => result.status === 'rejected') || skippedAfterMove
              ? 'failed'
              : 'loaded';

        return { members: [...byId.values()], context: { cid, sid }, profiles };
    }
}
