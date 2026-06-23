import type {
    ChannelSyncUsersInput,
    ChatUsersInput,
    UserInviteInput,
    UserUpdateProfileInput,
} from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { DomainListResult, DomainUser } from '../domain';
import { toDomainUser } from '../domain';
import type { IUserLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import {
    BaseRepositoryV2,
    type DataContextProviderV2,
    type DisposableRepositoryV2,
    type RepositoryRefreshResult,
} from './types';

export interface IUserRepositoryV2 extends DisposableRepositoryV2 {
    observeList(query: ChatUsersInput, callback: (result: DomainListResult<DomainUser> | null) => void): () => void;
    observeItem(id: string, callback: (item: DomainUser | null) => void): () => void;

    refreshList(query: ChatUsersInput): Promise<RepositoryRefreshResult>;
    updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser>;
    requestInvite(payload: UserInviteInput): Promise<MyInviteView>;
    requestInviteBatch(payload: MyUserInviteBody): Promise<MyInviteView[]>;
    refreshChannelUsers(payload: ChannelSyncUsersInput): Promise<RepositoryRefreshResult>;

    cacheRead(id: string): Promise<DomainUser | null>;
    cacheReadList(query: ChatUsersInput): Promise<DomainListResult<DomainUser> | null>;
    cacheWrite(item: Partial<DomainUser>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainUser>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Handles user cache hydration and optimistic profile edits inside the active cid/sid/uid scope. */
export class UserRepositoryV2 extends BaseRepositoryV2 implements IUserRepositoryV2 {
    constructor(
        private readonly userRemoteDataSource: IUserRemoteDataSource,
        private readonly userLocalDataSource: IUserLocalDataSourceV2,
        contextProvider: DataContextProviderV2
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

    public async refreshList(query: ChatUsersInput): Promise<RepositoryRefreshResult> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const remote = await this.userRemoteDataSource.fetchUsers(query);
        const domainList = (remote.list || []).map(item => ({
            ...toDomainUser(item as UserView, requestScope),
            cid: requestScope.cid,
        }));
        if (!this.isSameContext(requestContext)) {
            return { wroteCount: 0 };
        }
        await this.userLocalDataSource.cacheWriteMany(domainList, requestContext);
        return { wroteCount: domainList.length };
    }

    public async updateProfile(payload: UserUpdateProfileInput): Promise<DomainUser> {
        const uid = (payload as { id?: string; userId?: string }).id || (payload as { userId?: string }).userId || '';
        const context = this.getRepositoryContext();
        const existing = uid ? await this.userLocalDataSource.cacheRead(uid, context) : null;
        if (uid) {
            await this.userLocalDataSource.cacheWrite({ id: uid, ...(payload as Partial<DomainUser>) }, context);
        }
        try {
            const remote = await this.userRemoteDataSource.updateProfile(payload);
            const domain = toDomainUser(remote as UserView, this.getDomainScope());
            await this.userLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (existing) {
                await this.userLocalDataSource.cacheWrite(existing, context);
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

    public async refreshChannelUsers(payload: ChannelSyncUsersInput): Promise<RepositoryRefreshResult> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const remote = await this.userRemoteDataSource.syncChannelUsers(payload);
        const domainList = (remote.list || []).map(item => ({
            ...toDomainUser(item as UserView, requestScope),
            cid: requestScope.cid,
        }));
        if (!this.isSameContext(requestContext)) {
            return { wroteCount: 0 };
        }
        await this.userLocalDataSource.cacheWriteMany(domainList, requestContext);
        return { wroteCount: domainList.length };
    }
}
