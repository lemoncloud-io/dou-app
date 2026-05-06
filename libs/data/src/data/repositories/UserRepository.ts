import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { ChatUsersPayload, UserInvitePayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { DomainEventMap, ListResult } from '../events/types';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { IUserLocalDataSource } from '../local/data-sources';

/**
 * 사용자 도메인의 Repository 공개 계약입니다.
 * 사용자 목록 조회, 채널 초대, 내 프로필 수정, 외부 초대 코드 생성을 담당합니다.
 */
export interface IUserRepository {
    /** 특정 채널 또는 조건에 맞는 사용자 목록을 조회합니다. */
    fetchUsers(payload: ChatUsersPayload, options?: RepositoryRequestOptions): Promise<ListResult<UserView>>;

    /** 내 사용자 프로필 정보를 수정합니다. */
    updateProfile(payload: UserUpdateProfilePayload, options?: RepositoryRequestOptions): Promise<UserView>;

    /** 외부 사용자 초대 코드를 생성합니다. */
    requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView>;
}

/**
 * UserRemoteDataSource를 감싸는 사용자 Repository 구현체입니다.
 * chat 도메인에 걸친 사용자 조회/초대 요청도 사용자 API로 묶어 노출합니다.
 */
export class UserRepository extends BaseRepository implements IUserRepository {
    constructor(
        private readonly userRemoteDataSource: IUserRemoteDataSource,
        private readonly userLocalDataSource: IUserLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    /** chat:users 요청을 수행하고 응답을 기다립니다. */
    public async fetchUsers(
        payload: ChatUsersPayload,
        options?: RepositoryRequestOptions
    ): Promise<ListResult<UserView>> {
        const policy = this.resolveCachePolicy(options);
        if (policy === 'network-only') {
            return this.fetchFromRemoteAndCache(payload, options);
        }

        const local = await this.userLocalDataSource.fetchUsers(payload, this.getRepositoryContext());
        if (policy === 'cache-only') {
            return (
                local ?? {
                    list: [],
                    limit: (payload as { limit?: number }).limit,
                    page: (payload as { page?: number }).page,
                    total: 0,
                }
            );
        }

        if (local) {
            this.runInBackground(
                () => this.fetchFromRemoteAndCache(payload, { ...options, cachePolicy: 'network-only' }),
                'user:cache-and-network-refresh'
            );
            return local;
        }

        return this.fetchFromRemoteAndCache(payload, options);
    }

    /** user:update-profile 요청을 수행하고 응답을 기다립니다. */
    public async updateProfile(
        payload: UserUpdateProfilePayload,
        options?: RepositoryRequestOptions
    ): Promise<UserView> {
        const user = await this.requestRemote<UserView>(
            ref => this.userRemoteDataSource.updateProfile(payload, ref),
            options
        );
        await this.userLocalDataSource.upsertUser(user, this.getRepositoryContext());
        return user;
    }

    /** user:invite 요청을 수행하고 정규화된 초대 결과를 기다립니다. (== 유저 생성) */
    public requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView> {
        return this.requestRemote(ref => this.userRemoteDataSource.requestInvite(payload, ref), options);
    }

    private resolveCachePolicy(
        options?: RepositoryRequestOptions
    ): NonNullable<RepositoryRequestOptions['cachePolicy']> {
        if (options?.cachePolicy) return options.cachePolicy;
        return 'cache-and-network';
    }

    private async fetchFromRemoteAndCache(
        payload: ChatUsersPayload,
        options?: RepositoryRequestOptions
    ): Promise<ListResult<UserView>> {
        const remote = await this.requestRemote<ListResult<UserView>>(
            ref => this.userRemoteDataSource.fetchUsers(payload, ref),
            options
        );
        await this.userLocalDataSource.upsertUsers(remote.list || [], this.getRepositoryContext());
        return remote;
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('user:create', detail => {
            const user = detail.data as Partial<UserView>;
            if (!user?.id) return;
            this.runInBackground(
                () => this.userLocalDataSource.upsertUser(user as UserView, this.getRepositoryContext()),
                'user:create'
            );
        });
        this.onDomainEvent('user:update', detail => {
            this.runInBackground(
                () => this.userLocalDataSource.upsertUser(detail.data, this.getRepositoryContext()),
                'user:update'
            );
        });
        this.onDomainEvent('user:delete', detail => {
            this.runInBackground(
                () => this.userLocalDataSource.deleteUser(detail.data.id || '', this.getRepositoryContext()),
                'user:delete'
            );
        });
        this.onDomainEvent('user:list', detail => {
            this.runInBackground(
                () => this.userLocalDataSource.upsertUsers(detail.data.list || [], this.getRepositoryContext()),
                'user:list'
            );
        });
    }
}
