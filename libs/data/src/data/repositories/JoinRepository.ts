import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';
import type { IJoinLocalDataSource } from '../local/data-sources';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import type ISyncRepository from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DomainEventMap } from '../events/domain';
import type { IEventBus } from '../events/eventBus';
import {
    createDomainListResult,
    type DomainJoin,
    type DomainJoinListPayload,
    type DomainListResult,
    toDomainJoin,
} from '../domain';
import type { JoinView } from '@lemoncloud/chatic-socials-api';

/** 채널 참여 상태(join) 도메인의 Repository 공개 계약입니다. */
export interface IJoinRepository extends ILocalCacheMutationRepository<DomainJoin> {
    /** 채널의 참여자(Join) 목록을 조회합니다. */
    fetchJoins(
        payload: DomainJoinListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainJoin>>;

    /** 특정 채팅 번호까지 읽었음을 서버에 알립니다. */
    readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<DomainJoin>;

    /** 알림 설정, 닉네임 등 채널 참여 정보를 갱신합니다. */
    updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<DomainJoin>;

    /** 현재 스코프의 join 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 참여 정보 생성(join:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinCreated(callback: (join: DomainJoin) => void): () => void;

    /** 서버로부터 참여 정보 변경(join:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinUpdated(callback: (join: DomainJoin) => void): () => void;

    /** 서버로부터 참여 정보 삭제(join:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onJoinDeleted(callback: (join: DomainJoin) => void): () => void;

    // --- 통합 스트림 인터페이스 ---
    /** 로컬 캐시 기준 채널 참여 목록을 스트림으로 구독합니다. */
    subscribeList(
        payload: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 참여 정보를 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (join: DomainJoin | null) => void): () => void;
}

/** Remote join API와 local join cache를 중재합니다. */
export class JoinRepository extends BaseRepository implements IJoinRepository, ISyncRepository {
    constructor(
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }
    sync(id?: string, meta?: Record<string, unknown>): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public async fetchJoins(
        payload: DomainJoinListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainJoin>> {
        const policy = this.resolveCachePolicy(options);
        if (policy === 'network-only') {
            throw this.createRemoteUnsupportedError(policy);
        }

        const local = await this.fetchLocalJoins(payload);
        if (local.list.length > 0 || policy === 'cache-only') {
            return local;
        }

        throw this.createRemoteUnsupportedError(policy);
    }

    public async readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<JoinView>(
            ref => this.joinRemoteDataSource.readChat(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsert(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    public async updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<JoinView>(
            ref => this.joinRemoteDataSource.updateJoin(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsert(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    public clearAll(): Promise<void> {
        return this.joinLocalDataSource.clearAll(this.getRepositoryContext());
    }

    public onJoinCreated(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:create', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    public onJoinUpdated(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:update', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    public onJoinDeleted(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:delete', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    // --- 스트림 인터페이스 ---
    public subscribeList(
        payload: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void
    ): () => void {
        return this.joinLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (join: DomainJoin | null) => void): () => void {
        return this.joinLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainJoin>): Promise<void> {
        return this.joinLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainJoin>): Promise<void> {
        return this.joinLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.joinLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainJoin>>): Promise<void> {
        return this.joinLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainJoin>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.joinLocalDataSource.upsert({ id: item.id, ...item.patch }, this.getRepositoryContext())
                )
        );
    }

    // --- Internal Logic ---
    private initializeInternalListeners(): void {
        this.onDomainEvent('join:create', detail => {
            if (!detail.data?.id) return;
            this.runInBackground(
                () => this.joinLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'join:create'
            );
        });
        this.onDomainEvent('join:update', detail => {
            // A failed/empty server response can surface a null payload — guard so the
            // background upsert doesn't crash on `null.id`.
            if (!detail.data?.id) return;
            this.runInBackground(
                () => this.joinLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'join:update'
            );
        });
        this.onDomainEvent('join:delete', detail => {
            if (!detail.data?.id) return;
            this.runInBackground(
                () => this.joinLocalDataSource.remove(detail.data.id || '', this.getRepositoryContext()),
                'join:delete'
            );
        });
    }

    private async fetchLocalJoins(payload: DomainJoinListPayload): Promise<DomainListResult<DomainJoin>> {
        const result = await this.joinLocalDataSource.fetchList(payload, this.getRepositoryContext());
        return result || createDomainListResult([], { total: 0, source: 'local' });
    }

    private createRemoteUnsupportedError(policy: string): Error {
        return new Error(
            `[JoinRepository] fetchJoins is local-only and does not support remote fetch (cachePolicy=${policy}).`
        );
    }
}
