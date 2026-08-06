import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { DomainJoin, DomainListResult, DomainUser } from '../domain';
import { toDomainJoinFromUser } from '../domain';
import type { IJoinLocalDataSourceV2, IPlaceLocalDataSourceV2, IUserLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface UserRepositoryV2Options {
    /**
     * Decides whether getMyProfile's embedded `$site` is persisted into the place cache for the
     * given (request-time) context. Defaults to always persisting — the pre-ADR-0045 behavior —
     * so apps that inject nothing (desktop-web) are unaffected. apps/web injects a relay-only
     * predicate so a cloud partition never receives the default place row.
     */
    persistEmbeddedSite?: (context: DataContext) => boolean;
}

export interface IUserRepositoryV2 extends DisposableRepositoryV2 {
    observeList(query: ChatUsersInput, callback: (result: DomainListResult<DomainUser> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainUser | null) => void): () => void;

    getMyProfile(): Promise<DomainUser>;
    updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser>;
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    requestInviteBatch(payload: MyUserInviteBody): Promise<MyInviteView[]>;
    syncChannelUsers(payload: ChannelSyncUsersInput): Promise<number>;

    cacheRead(id: string): Promise<DomainUser | null>;
    cacheReadList(query: ChatUsersInput): Promise<DomainListResult<DomainUser> | null>;
    cacheWrite(item: Partial<DomainUser>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainUser>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Handles user cache hydration and optimistic profile edits inside the active cid/sid/uid context. */
export class UserRepositoryV2 extends BaseRepositoryV2 implements IUserRepositoryV2 {
    constructor(
        private readonly userRemoteDataSource: IUserRemoteDataSource,
        private readonly userLocalDataSource: IUserLocalDataSourceV2,
        private readonly joinLocalDataSource: IJoinLocalDataSourceV2,
        private readonly placeLocalDataSource: IPlaceLocalDataSourceV2,
        contextProvider: DataContextProvider,
        private readonly options?: UserRepositoryV2Options
    ) {
        super(contextProvider);
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
        const remote = await this.userRemoteDataSource.fetchUsers(
            {
                ...query,
                detail: true,
            },
            normalizedContext
        );
        const users = remote.list || [];
        await this.userLocalDataSource.cacheWriteMany(users, requestContext);

        // listUser 응답의 각 user에 read-state가 `$join`으로 실려온다(detail: true). user 캐시와
        // 함께 join 캐시도 hydrate해, 멤버별 읽음 커서가 별도 join.get 없이 채워지게 한다.
        const channelId = (query as { channelId?: string }).channelId;
        const joins = users
            .map(user => toDomainJoinFromUser(user, normalizedContext, channelId))
            .filter((join): join is DomainJoin => !!join);

        if (joins.length > 0) {
            await this.joinLocalDataSource.cacheWriteMany(joins, requestContext);
        }
    }

    public async getMyProfile(): Promise<DomainUser> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const { user, site } = await this.userRemoteDataSource.getMyProfile(normalizedContext);
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
            const domain = await this.userRemoteDataSource.updateProfile(payload, normalizedContext);
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
        return this.userRemoteDataSource.requestInvite(payload);
    }

    public async requestInviteBatch(payload: MyUserInviteBody): Promise<MyInviteView[]> {
        const to = payload.alias ? [payload.alias] : payload.userId ? [payload.userId] : [];
        const result = await this.userRemoteDataSource.inviteBatch({ to });
        return result.list || [];
    }

    public async syncChannelUsers(payload: ChannelSyncUsersInput): Promise<number> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.userRemoteDataSource.syncChannelUsers(payload, normalizedContext);

        await this.userLocalDataSource.cacheWriteMany(remote.users, requestContext);
        // Members arrive with their read-state embedded (`$join`); persist it so every
        // member's join row is hydrated from the same response, not a separate join.get.
        if (remote.joins.length > 0) {
            await this.joinLocalDataSource.cacheWriteMany(remote.joins, requestContext);
        }

        // syncedAt is the cursor the caller passes back as `since` on the next sync.
        return remote.syncedAt;
    }
}
