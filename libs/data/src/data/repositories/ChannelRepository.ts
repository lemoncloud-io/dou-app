import {
    BaseRepository,
    type DataContextProvider,
    type ILocalCacheMutationRepository,
    type LocalCacheBulkPatch,
    type RepositoryRequestOptions,
} from './types';
import type { IChannelLocalDataSource } from '../local/data-sources';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import {
    createDomainListResult,
    type DomainChannel,
    type DomainChannelListPayload,
    type DomainListResult,
    toDomainChannel,
} from '../domain';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../events/common';

/** 채널 도메인의 Repository 공개 계약입니다. */
export interface IChannelRepository extends ILocalCacheMutationRepository<DomainChannel> {
    /** 내가 참여 중인 채널 목록을 조회합니다. */
    fetchChannel(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>>;

    /** 채널 이름/설정 등 채널 메타데이터를 수정합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널 삭제 또는 종료 요청을 수행합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 신규 채널을 생성하거나 대화를 시작합니다. */
    createChannel(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 기존 채널에 사용자를 초대합니다. */
    inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 현재 스코프의 channel 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelUpdated(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelDeleted(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 신규 채널 생성(channel:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelCreated(callback: (channel: DomainChannel) => void): () => void;

    subscribeList(
        payload: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void;

    subscribeItem(id: string, callback: (channel: DomainChannel | null) => void): () => void;
}

export class ChannelRepository extends BaseRepository implements IChannelRepository {
    constructor(
        private readonly channelRemoteDataSource: IChannelRemoteDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    // --- Remote API ---
    public async fetchChannel(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainChannel>>({
            options,
            backgroundLabel: 'channel',
            fetchLocal: () => this.channelLocalDataSource.fetchList(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () => createDomainListResult([], { total: 0, source: 'fallback' }),
        });
    }

    public async updateChannel(
        payload: ChatUpdateChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.updateChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async deleteChannel(
        payload: ChatDeleteChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.deleteChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.remove(
            domainChannel.id || payload.channelId || '',
            this.getRepositoryContext()
        );
        return domainChannel;
    }

    public async createChannel(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.startChat(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.inviteChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsert(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    public async leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.leaveChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.remove(
            domainChannel.id || payload.channelId || '',
            this.getRepositoryContext()
        );
        return domainChannel;
    }

    public clearAll(): Promise<void> {
        return this.channelLocalDataSource.clearAll(this.getRepositoryContext());
    }

    // --- 개별 이벤트 리스너 ---
    public onChannelUpdated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:update', detail => callback(detail.data as DomainChannel));
    }

    public onChannelDeleted(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:delete', detail => callback(detail.data as DomainChannel));
    }

    public onChannelCreated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:create', detail => callback(detail.data as DomainChannel));
    }

    // --- 스트림 인터페이스 ---
    public subscribeList(
        payload: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void {
        return this.channelLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (channel: DomainChannel | null) => void): () => void {
        return this.channelLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.channelLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainChannel>>): Promise<void> {
        return this.channelLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainChannel>>): Promise<void> {
        await this.channelLocalDataSource.upsertMany(
            items.map(it => ({ id: it.id, ...it.patch })),
            this.getRepositoryContext()
        );
    }

    // --- Internal Logic ---
    private async fetchFromRemoteAndCache(
        payload: DomainChannelListPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        const remote = await this.requestRemote<ListResult<ChannelView>>(
            ref => this.channelRemoteDataSource.fetchChannel(payload, ref),
            options
        );
        const domainList = (remote.list || []).map(item => toDomainChannel(item, this.getDomainScope()));
        return createDomainListResult(domainList, {
            total: remote.total ?? domainList.length,
            limit: remote.limit,
            page: remote.page,
            source: 'remote',
        });
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('channel:create', detail =>
            this.runInBackground(
                () => this.channelLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'channel:create'
            )
        );
        this.onDomainEvent('channel:update', detail =>
            this.runInBackground(
                () => this.channelLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
                'channel:update'
            )
        );
        this.onDomainEvent('channel:delete', detail =>
            this.runInBackground(
                () => this.channelLocalDataSource.remove(detail.data.id || '', this.getRepositoryContext()),
                'channel:delete'
            )
        );
        this.onDomainEvent('channel:list', detail =>
            this.runInBackground(
                () => this.channelLocalDataSource.upsertMany(detail.data.list || [], this.getRepositoryContext()),
                'channel:list'
            )
        );
    }
}
