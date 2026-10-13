import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { DomainListResult, DomainPlaceMember, DomainUser } from '../domain';
import type { IJoinLocalDataSource, IPlaceLocalDataSource, IUserLocalDataSource } from '../local/data-sources';
import type { IUserSocketDataSource, UserInviteBatchPayload } from '../remote/socket-data-sources';
import type { IUserHttpDataSource } from '../remote/http-data-sources';
import type { IProfileRepository } from './ProfileRepository';
import { isForeignContext } from './scopeGuards';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

/** The server's own default page size for `place.list-user`, kept so both calls of a page agree. */
const PLACE_MEMBER_PAGE_SIZE = 10;

export interface PlaceMembersQuery {
    /** The place whose members are listed. */
    placeId: string;
    /**
     * The place the socket session is on, or `null` when the caller cannot vouch for one (a switch in
     * flight). Profiles are loaded only when this equals `placeId`: `profile.sync` answers for the
     * session's place, and its rows are stamped with the place the caller names.
     */
    sessionPlaceId: string | null;
    /** Members per page — and so the most user ids one profile load names. Defaults to 10. */
    pageSize?: number;
}

export interface PlaceMembersResult {
    members: DomainPlaceMember[];
    /** The cloud and place the request was made for, so a caller can drop an answer that outlived its scope. */
    context: { cid: string; sid: string };
    /**
     * What happened to the members' place profiles: `loaded` into the profile cache, `skipped` because
     * the session is on another place, or `failed` on at least one page. The members are returned
     * either way.
     */
    profiles: 'loaded' | 'skipped' | 'failed';
}

export interface UserRepositoryOptions {
    /**
     * Decides whether getMyProfile's embedded `$site` is persisted into the place cache for the
     * given (request-time) context. Defaults to always persisting — the pre-ADR-0094 behavior —
     * so apps that inject nothing (desktop-web) are unaffected. apps/web injects a relay-only
     * predicate so a cloud partition never receives the default place row.
     */
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
    /**
     * place.list-user — every member of one place, read page by page, with each page's place profiles
     * loaded into the profile cache as it arrives (see `PlaceMembersQuery.sessionPlaceId`). The list
     * itself is not cached: it is asked for each time a picker opens.
     */
    listPlaceMembers(query: PlaceMembersQuery): Promise<PlaceMembersResult>;

    cacheRead(id: string): Promise<DomainUser | null>;
    cacheReadList(query: ChatUsersInput): Promise<DomainListResult<DomainUser> | null>;
    cacheWrite(item: Partial<DomainUser>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainUser>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;

    /**
     * HTTP relay-user listing/profile surface (ADR-0070 decision 5, late stage 2). `IUserHttpDataSource`
     * injection is optional (see libs/data/docs/repositories/README.md). `listRelayUsers` has exactly one
     * consumer: the admin-v2 user console (`apps/admin-v2/.../users/api/usersQuery.ts`).
     */
    listRelayUsers(params?: Record<string, unknown>): Promise<DomainListResult<DomainUser>>;
    tryFetchProfile(): Promise<UserProfile$>;
}

/** Handles user cache hydration and optimistic profile edits inside the active cid/sid/uid context. */
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

    public async listRelayUsers(params?: Record<string, unknown>): Promise<DomainListResult<DomainUser>> {
        return this.requireHttp().listRelayUsers(params, this.getRequestContext());
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
        // Each user in a listUser response carries its read-state as `$join` (detail: true). The data
        // source pulls that out of the raw view and hands it over as a join, so hydrating the user cache
        // and the join cache together fills in each member's read cursor with no separate join.get.
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
        // Hydrate the user cache so observeItem subscribers see the fetched profile.

        await this.userLocalDataSource.cacheWrite(user, requestContext);
        // The profile embeds the current site ($site); persist it into the place cache so the active
        // site is present even before a full place list refresh. (Mirrors the embedded $join write.)
        // The injected predicate can veto the write per context — apps/web restricts it to the relay
        // scope so the default place never lands in a cloud partition (ADR-0045).
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

    /**
     * Bulk invite — the payload is passed through untouched. It used to be built here from a
     * single-invite body (`{ alias }` folded into `to: [alias]`), which forced callers to encode a
     * recipient LIST as one comma-joined string; the server then read that string as one phone and
     * rejected it (`@phone[a,b] is invalid format`). `to` is a string[] on the wire, so the list
     * stays a list and `channelId` reaches the server instead of being dropped.
     */
    public async requestInviteBatch(payload: UserInviteBatchPayload): Promise<MyInviteView[]> {
        const result = await this.userSocketDataSource.inviteBatch(payload);
        return result.list || [];
    }

    public async syncChannelUsers(payload: ChannelSyncUsersInput): Promise<number> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.userSocketDataSource.syncChannelUsers(payload, normalizedContext);

        await this.userLocalDataSource.cacheWriteMany(remote.users, requestContext);
        // Members arrive with their read-state embedded (`$join`); persist it so every
        // member's join row is hydrated from the same response, not a separate join.get.
        if (remote.joins.length > 0) {
            await this.joinLocalDataSource.cacheWriteMany(remote.joins, requestContext);
        }

        // syncedAt is the cursor the caller passes back as `since` on the next sync.
        return remote.syncedAt;
    }

    public async listPlaceMembers({
        placeId,
        sessionPlaceId,
        pageSize = PLACE_MEMBER_PAGE_SIZE,
    }: PlaceMembersQuery): Promise<PlaceMembersResult> {
        const sid = this.assertRequiredString(placeId, 'placeId');
        const requestContext = this.getRequestContext();
        // A socket still bound to the outgoing cloud would answer for that cloud: refuse rather than
        // hand back somebody else's member list under this cloud's name.
        if (isForeignContext(requestContext)) {
            throw new Error('[UserRepository] place.list-user: the socket is still on another cloud');
        }
        const normalizedContext = this.getNormalizedContext(requestContext);
        const cid = normalizedContext.cid || 'default';
        const loadProfiles = !!this.profileRepository && sessionPlaceId === sid;
        // A profile answer is filed under the cloud the repository is on WHEN IT IS SENT, so each load
        // first checks that is still the one this list was asked for. A cloud switch between pages
        // stops the profile loads; the members already read are still returned.
        const stillInScope = () => {
            const current = this.getRepositoryContext();
            return (current.cid || 'default') === cid && !isForeignContext(current);
        };
        let skippedAfterMove = false;
        // Profile loads run alongside the paging rather than between pages, so the list's own round
        // trips set the wait; each still names one page's ids at most.
        const profileLoads: Array<Promise<unknown>> = [];

        const byId = new Map<string, DomainPlaceMember>();
        for (let page = 0; ; page += 1) {
            const answer = await this.userSocketDataSource.fetchPlaceUsers(
                { id: sid, page, limit: pageSize },
                normalizedContext
            );
            // An empty page is the end. A SHORT page is not: the server drops members who have left
            // after slicing the page, so only `total` (counted before that) says where the list stops.
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

            // A page that brought nobody new means the server is not paging; stop rather than spin.
            if (fresh.length === 0) break;
            const limit = answer.limit > 0 ? answer.limit : pageSize;
            if ((page + 1) * limit >= answer.total) break;
        }

        // A failed load leaves those rows to the user's own name — the list is still worth showing.
        const settled = await Promise.allSettled(profileLoads);
        const profiles: PlaceMembersResult['profiles'] = !loadProfiles
            ? 'skipped'
            : settled.some(result => result.status === 'rejected') || skippedAfterMove
              ? 'failed'
              : 'loaded';

        return { members: [...byId.values()], context: { cid, sid }, profiles };
    }
}
