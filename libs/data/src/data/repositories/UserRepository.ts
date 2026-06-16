import type { ChatUsersPayload, UserInvitePayload, UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView, MyUserInviteBody } from '@lemoncloud/chatic-backend-api';
import type { DomainEventMap, ListResult } from '../events/types';
import type { IUserRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import type ISyncRepository from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { IProfileLocalDataSource, IUserLocalDataSource } from '../local/data-sources';
import { createDomainListResult, type DomainListResult, type DomainUser, toDomainUser } from '../domain';
import type { UserView } from '@lemoncloud/chatic-socials-api';

/**
 * 사용자 도메인의 Repository 공개 계약입니다.
 * 사용자 목록 조회, 채널 초대, 내 프로필 수정, 외부 초대 코드 생성을 담당합니다.
 */
export interface IUserRepository extends ILocalCacheMutationRepository<DomainUser> {
    /** 특정 채널 또는 조건에 맞는 사용자 목록을 조회합니다. */
    fetchUsers(payload: ChatUsersPayload, options?: RepositoryRequestOptions): Promise<DomainListResult<DomainUser>>;

    /** 내 사용자 프로필 정보를 수정합니다. */
    updateProfile(payload: UserUpdateProfilePayload, options?: RepositoryRequestOptions): Promise<DomainUser>;

    /** 외부 사용자 초대 코드를 생성합니다. */
    requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView>;

    /** 여러 사용자를 일괄 초대합니다. */
    requestInviteBatch(payload: MyUserInviteBody, options?: RepositoryRequestOptions): Promise<MyInviteView[]>;

    /** 현재 스코프의 user 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 신규 사용자 생성(user:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserCreated(callback: (user: DomainUser) => void): () => void;

    /** 기존 사용자 정보 변경(user:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserUpdated(callback: (user: DomainUser) => void): () => void;

    /** 사용자 삭제/탈퇴(user:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onUserDeleted(callback: (user: DomainUser) => void): () => void;

    /** 로컬 캐시 기준 사용자 목록을 스트림으로 구독합니다. */
    subscribeList(
        payload: ChatUsersPayload,
        callback: (result: DomainListResult<DomainUser> | null) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 사용자를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (user: DomainUser | null) => void): () => void;
}

/**
 * UserRemoteDataSource를 감싸는 사용자 Repository 구현체입니다.
 * chat 도메인에 걸친 사용자 조회/초대 요청도 사용자 API로 묶어 노출합니다.
 */
export class UserRepository extends BaseRepository implements IUserRepository, ISyncRepository {
    constructor(
        private readonly userRemoteDataSource: IUserRemoteDataSource,
        private readonly userLocalDataSource: IUserLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>,
        private readonly profileLocalDataSource?: IProfileLocalDataSource
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }
    sync(id?: string, meta?: Record<string, unknown>): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public async fetchUsers(
        payload: ChatUsersPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainUser>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainUser>>({
            options,
            backgroundLabel: 'user',
            fetchLocal: () => this.userLocalDataSource.fetchList(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () =>
                createDomainListResult([], {
                    limit: (payload as { limit?: number }).limit,
                    page: (payload as { page?: number }).page,
                    total: 0,
                    source: 'fallback',
                }),
        });
    }

    public async updateProfile(
        payload: UserUpdateProfilePayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainUser> {
        const user = await this.requestRemote<UserView>(
            ref => this.userRemoteDataSource.updateProfile(payload, ref),
            options
        );
        const domainUser = toDomainUser(user, this.getDomainScope());
        await this.userLocalDataSource.upsert(domainUser, this.getRepositoryContext());
        return domainUser;
    }

    public requestInvite(payload: UserInvitePayload, options?: RepositoryRequestOptions): Promise<MyInviteView> {
        return this.requestRemote<MyInviteView>(ref => this.userRemoteDataSource.requestInvite(payload, ref), options);
    }

    public requestInviteBatch(payload: MyUserInviteBody, options?: RepositoryRequestOptions): Promise<MyInviteView[]> {
        return this.requestRemote<MyInviteView[]>(
            ref => this.userRemoteDataSource.requestInviteBatch(payload, ref),
            options
        );
    }

    public clearAll(): Promise<void> {
        return this.userLocalDataSource.clearAll(this.getRepositoryContext());
    }

    public onUserCreated(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:create', detail => {
            callback(detail.data as DomainUser);
        });
    }

    public onUserUpdated(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:update', detail => {
            callback(detail.data as DomainUser);
        });
    }

    public onUserDeleted(callback: (user: DomainUser) => void): () => void {
        return this.onDomainEvent('user:delete', detail => {
            callback(detail.data as DomainUser);
        });
    }

    // --- 스트림 인터페이스 통합 ---
    public subscribeList(
        payload: ChatUsersPayload,
        callback: (result: DomainListResult<DomainUser> | null) => void
    ): () => void {
        return this.userLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (user: DomainUser | null) => void): () => void {
        return this.userLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainUser>): Promise<void> {
        return this.userLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainUser>): Promise<void> {
        return this.userLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.userLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainUser>>): Promise<void> {
        return this.userLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainUser>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.userLocalDataSource.upsert({ id: item.id, ...item.patch }, this.getRepositoryContext())
                )
        );
    }

    private async fetchFromRemoteAndCache(
        payload: ChatUsersPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainUser>> {
        // 요청 시점의 context를 캡처 — await 중 cloud 전환이 발생해도 올바른 scope에 캐시 저장
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();

        const remote = await this.requestRemote<ListResult<UserView>>(
            ref => this.userRemoteDataSource.fetchUsers(payload, ref),
            options
        );
        // 서버 응답의 cid(e.g. "global")는 cloud 파티셔닝 기준과 다를 수 있으므로
        // requestScope.cid(= 요청 시점의 cloudId)로 강제 대체
        const domainList = (remote.list || []).map(item => ({
            ...toDomainUser(item, requestScope),
            cid: requestScope.cid,
        }));

        // cloud가 전환되었으면 캐시 저장 스킵 — cross-cloud 오염 방지
        const currentCid = this.getRepositoryContext().cid;
        if (currentCid === requestContext.cid) {
            await this.userLocalDataSource.upsertMany(domainList, requestContext);
            // 응답의 nick/thumbnail을 place-profile 캐시로 미러링 — 백엔드가
            // channel.sync-site-profile delta를 아직 채워주지 않아(ADR 0007), 이
            // 응답이 타인 프로필 변경이 캐시에 도달하는 유일한 경로입니다.
            // 정식 profile sync가 구현되면 이 미러링은 제거합니다.
            const profilePatches = domainList
                .filter(user => user.id && (user.nick !== undefined || user.thumbnail !== undefined))
                .map(user => ({
                    id: `${requestScope.sid ?? ''}@${user.id}`,
                    cid: requestScope.cid,
                    sid: requestScope.sid,
                    uid: user.id,
                    ...(user.nick !== undefined ? { nick: user.nick } : {}),
                    ...(user.thumbnail !== undefined ? { thumbnail: user.thumbnail } : {}),
                    updatedAt: Date.now(),
                }));
            if (profilePatches.length > 0) {
                await this.profileLocalDataSource?.upsertMany(profilePatches, requestContext);
            }
        }

        return createDomainListResult(domainList, {
            total: remote.total ?? domainList.length,
            limit: remote.limit,
            page: remote.page,
            source: 'remote',
        });
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('user:create', detail => {
            const user = detail.data;
            if (!user?.id) return;
            this.runInBackground(
                () =>
                    this.userLocalDataSource.upsert(
                        toDomainUser(user, this.getDomainScope()),
                        this.getRepositoryContext()
                    ),
                'user:create'
            );
        });

        this.onDomainEvent('user:update', detail => {
            const user = detail.data;
            if (!user?.id) return;
            this.runInBackground(
                () =>
                    this.userLocalDataSource.upsert(
                        toDomainUser(user, this.getDomainScope()),
                        this.getRepositoryContext()
                    ),
                'user:update'
            );
        });

        this.onDomainEvent('user:delete', detail => {
            const userId = detail.data?.id;
            if (!userId) return;
            this.runInBackground(
                () => this.userLocalDataSource.remove(userId, this.getRepositoryContext()),
                'user:delete'
            );
        });

        this.onDomainEvent('user:list', detail => {
            const list = detail.data?.list || [];
            if (list.length === 0) return;
            this.runInBackground(() => {
                const domainUsers = list.map((item: any) => toDomainUser(item, this.getDomainScope()));
                return this.userLocalDataSource.upsertMany(domainUsers, this.getRepositoryContext());
            }, 'user:list');
        });
    }
}
