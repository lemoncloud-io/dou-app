import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { DomainListResult, DomainUser } from '../domain';
import type { IUserLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from '../repositories';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IUserRepositoryV2 extends DisposableRepositoryV2 {
    observeList(query: ChatUsersInput, callback: (result: DomainListResult<DomainUser> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainUser | null) => void): () => void;

    refreshList(query: ChatUsersInput): Promise<void>;
    updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser>;
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    requestInviteBatch(payload: MyUserInviteBody): Promise<MyInviteView[]>;
    refreshChannelUsers(payload: ChannelSyncUsersInput): Promise<void>;

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
        contextProvider: DataContextProvider
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
        const remote = await this.userRemoteDataSource.fetchUsers(query, normalizedContext);
        await this.userLocalDataSource.cacheWriteMany(remote.list || [], requestContext);
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

    public async refreshChannelUsers(payload: ChannelSyncUsersInput): Promise<void> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.userRemoteDataSource.syncChannelUsers(payload, normalizedContext);
        await this.userLocalDataSource.cacheWriteMany(remote.list || [], requestContext);
    }
}
