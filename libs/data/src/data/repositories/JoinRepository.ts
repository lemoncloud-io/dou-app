import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';
import type { IJoinLocalDataSource } from '../local/data-sources';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from './types';
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
export interface IJoinRepository {
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

    /** 로컬 캐시 기준 채널 참여 목록을 스트림으로 구독합니다. */
    subscribeJoins(
        payload: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin>) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 참여 정보를 스트림으로 구독합니다. */
    subscribeJoin(id: string, callback: (join: DomainJoin | null) => void): () => void;
}

/** Remote join API와 local join cache를 중재합니다. */
export class JoinRepository extends BaseRepository implements IJoinRepository {
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

    /** 채널 조인 목록을 조회합니다. */
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

    /** chat:read 요청을 수행하고 응답을 기다립니다. */
    public async readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<JoinView>(
            ref => this.joinRemoteDataSource.readChat(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsertJoin(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    /** chat:update-join 요청을 수행하고 응답을 기다립니다. */
    public async updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<JoinView>(
            ref => this.joinRemoteDataSource.updateJoin(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsertJoin(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    /** 현재 스코프의 join 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.joinLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /** 서버로부터 참여 정보 생성(join:create) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinCreated(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:create', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    /** 서버로부터 참여 정보 변경(join:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinUpdated(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:update', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    /** 서버로부터 참여 정보 삭제(join:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onJoinDeleted(callback: (join: DomainJoin) => void): () => void {
        return this.onDomainEvent('join:delete', detail => {
            callback(detail.data as DomainJoin);
        });
    }

    /** 로컬 참여 목록 스냅샷을 지속 구독합니다. */
    public subscribeJoins(
        payload: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin>) => void
    ): () => void {
        const channelId = payload.channelId || '';
        return this.joinLocalDataSource.subscribeJoinsByChannel(
            channelId,
            joins => callback(createDomainListResult({ list: joins, total: joins.length }, { source: 'local' })),
            { activeOnly: payload.activeOnly },
            this.getRepositoryContext()
        );
    }

    /** 로컬 단일 참여 정보 스냅샷을 지속 구독합니다. */
    public subscribeJoin(id: string, callback: (join: DomainJoin | null) => void): () => void {
        return this.joinLocalDataSource.subscribeJoin(id, callback, this.getRepositoryContext());
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('join:create', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.upsertJoin(detail.data, this.getRepositoryContext()),
                'join:create'
            );
        });
        this.onDomainEvent('join:update', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.upsertJoin(detail.data, this.getRepositoryContext()),
                'join:update'
            );
        });
        this.onDomainEvent('join:delete', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.deleteJoin(detail.data.id || '', this.getRepositoryContext()),
                'join:delete'
            );
        });
    }

    private async fetchLocalJoins(payload: DomainJoinListPayload): Promise<DomainListResult<DomainJoin>> {
        const channelId = payload?.channelId;
        if (!channelId) return createDomainListResult({ list: [], total: 0 }, { source: 'local' });

        const joins = payload.activeOnly
            ? await this.joinLocalDataSource.getActiveJoinsByChannel(channelId, this.getRepositoryContext())
            : await this.joinLocalDataSource.getJoinsByChannel(channelId, this.getRepositoryContext());

        return createDomainListResult({ list: joins, total: joins.length }, { source: 'local' });
    }

    private createRemoteUnsupportedError(policy: string): Error {
        return new Error(
            `[JoinRepository] fetchJoins is local-only and does not support remote fetch (cachePolicy=${policy}).`
        );
    }
}
