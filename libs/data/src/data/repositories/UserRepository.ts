import type { ChatUsersPayload, UserInvitePayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, UserView } from '@lemoncloud/chatic-backend-api';
import type { DomainEventMap, ListResult } from '../events/types';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { IUserLocalDataSource } from '../local/data-sources';
import type { DomainListResult, DomainUser } from '../domain';
import { toDomainUser } from '../domain';

/**
 * 사용자 도메인의 Repository 공개 계약입니다.
 * 사용자 목록 조회, 채널 초대, 내 프로필 수정, 외부 초대 코드 생성을 담당합니다.
 */
export interface IUserRepository {
    /** 특정 채널 또는 조건에 맞는 사용자 목록을 조회합니다. */
    fetchUsers(payload: ChatUsersPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainUser>>;

    /** 내 사용자 프로필 정보를 수정합니다. */
    updateProfile(payload: UserUpdateProfilePayload, options?: RepositoryRequestOptions): Promise<DomainUser>;

    /** 외부 사용자 초대 코드를 생성합니다. */
    requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView>;

    /** 현재 스코프의 user 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 신규 사용자 생성(user:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserCreated(callback: (user: DomainUser) => void): () => void;

    /** 기존 사용자 정보 변경(user:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserUpdated(callback: (user: DomainUser) => void): () => void;

    /** 사용자 삭제/탈퇴(user:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserDeleted(callback: (user: DomainUser) => void): () => void;
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
    ): Promise<DomainListResult<DomainUser>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainUser>>({
            options,
            backgroundLabel: 'user',
            fetchLocal: () => this.userLocalDataSource.fetchUsers(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () => ({
                list: [],
                limit: (payload as { limit?: number }).limit,
                page: (payload as { page?: number }).page,
                total: 0,
            }),
        });
    }

    /** user:update-profile 요청을 수행하고 응답을 기다립니다. */
    public async updateProfile(
        payload: UserUpdateProfilePayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainUser> {
        const user = await this.requestRemote<UserView>(
            ref => this.userRemoteDataSource.updateProfile(payload, ref),
            options
        );
        const domainUser = toDomainUser(user, this.getDomainScope());
        await this.userLocalDataSource.upsertUser(domainUser, this.getRepositoryContext());
        return domainUser;
    }

    /** user:invite 요청을 수행하고 정규화된 초대 결과를 기다립니다. (== 유저 생성) */
    public requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView> {
        return this.requestRemote(ref => this.userRemoteDataSource.requestInvite(payload, ref), options);
    }

    /** 현재 스코프의 user 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.userLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /** 서버로부터 신규 사용자 생성(user:create) 이벤트를 수신하는 리스너를 등록합니다. */
    public onUserCreated(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:create', detail => {
            callback(detail.data as DomainUser);
        });
    }

    /** 기존 사용자 정보 변경(user:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onUserUpdated(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:update', detail => {
            callback(detail.data as DomainUser);
        });
    }

    /** 사용자 삭제/탈퇴(user:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onUserDeleted(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:delete', detail => {
            callback(detail.data as DomainUser);
        });
    }

    private async fetchFromRemoteAndCache(
        payload: ChatUsersPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainUser>> {
        const remote = await this.requestRemote<ListResult<UserView>>(
            ref => this.userRemoteDataSource.fetchUsers(payload, ref),
            options
        );
        const domainList = (remote.list || []).map(item => toDomainUser(item, this.getDomainScope()));
        await this.userLocalDataSource.upsertUsers(domainList, this.getRepositoryContext());
        return { ...remote, list: domainList };
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('user:create', detail => {
            const user = detail.data as Partial<DomainUser>;
            if (!user?.id) return;
            this.runInBackground(
                () =>
                    this.userLocalDataSource.upsertUser(
                        toDomainUser(user, this.getDomainScope()),
                        this.getRepositoryContext()
                    ),
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
