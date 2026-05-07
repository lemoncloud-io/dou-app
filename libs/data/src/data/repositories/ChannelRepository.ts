import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatMinePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { IChannelLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainChannel } from '../domain';
import { toDomainChannel } from '../domain';

/** 채널 도메인의 Repository 공개 계약입니다. */
export interface IChannelRepository {
    /** 내가 참여 중인 채널 목록을 조회합니다. */
    fetchChannel(payload: ChatMinePayload, options?: RepositoryRequestOptions): Promise<ListResult<DomainChannel>>;

    /** 채널 이름/설정 등 채널 메타데이터를 수정합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널 삭제 또는 종료 요청을 수행합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 신규 채널을 생성하거나 대화를 시작합니다. */
    startChat(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 기존 채널에 사용자를 초대합니다. */
    inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 현재 스코프의 channel 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelUpdated(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelDeleted(callback: (channel: DomainChannel) => void): () => void;

    /** 서버로부터 신규 채널 생성(channel:create) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelCreated(callback: (channel: DomainChannel) => void): () => void;
    inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelUpdated(callback: (channel: ChannelView) => void): () => void;

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelDeleted(callback: (channel: ChannelView) => void): () => void;
}

/** Remote channel API와 local channel cache를 중재합니다. */
export class ChannelRepository extends BaseRepository implements IChannelRepository {
    /** 동시 다발적 fetchChannel 호출을 하나의 WebSocket 요청으로 합치기 위한 inflight Promise */
    private inflightFetchChannel: Promise<ListResult<ChannelView>> | null = null;

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

    public async fetchChannel(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<ListResult<DomainChannel>> {
        return this.fetchWithCachePolicy<ListResult<DomainChannel>>({
            options,
            backgroundLabel: 'channel',
            fetchLocal: () => this.channelLocalDataSource.fetchChannel(payload, this.getRepositoryContext()),
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

    /** chat:update-channel 요청을 수행하고 응답을 기다립니다. */
    public async updateChannel(
        payload: ChatUpdateChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.updateChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsertChannel(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    /** chat:delete-channel 요청을 수행하고 응답을 기다립니다. */
    public async deleteChannel(
        payload: ChatDeleteChannelPayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.deleteChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.deleteChannel(
            domainChannel.id || (payload as { channelId?: string }).channelId || '',
            this.getRepositoryContext()
        );
        return domainChannel;
    }

    /** chat:start 요청을 수행하고 응답을 기다립니다. */
    public async startChat(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.startChat(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsertChannel(domainChannel, this.getRepositoryContext());
        return domainChannel;
    }

    /** chat:invite 요청을 수행하고 응답을 기다립니다. */
    public async inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.inviteChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.upsertChannel(domainChannel, this.getRepositoryContext());
        return domainChannel;
        await this.channelLocalDataSource.upsertChannel(channel, this.getRepositoryContext());
        return channel;
    }

    /** chat:leave 요청을 수행하고 응답을 기다립니다. */
    public leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelRemoteDataSource.leaveChannel(payload, ref), options);
    }

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelUpdated(callback: (channel: ChannelView) => void): () => void {
        return this.onDomainEvent('channel:update', detail => {
            callback(detail.data as ChannelView);
        });
    }

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelDeleted(callback: (channel: ChannelView) => void): () => void {
        return this.onDomainEvent('channel:delete', detail => {
            callback(detail.data as ChannelView);
        });
    }

    private resolveCachePolicy(
        options?: RepositoryRequestOptions
    ): NonNullable<RepositoryRequestOptions['cachePolicy']> {
        if (options?.cachePolicy) return options.cachePolicy;
        return 'cache-and-network';
    }

    /** 현재 스코프의 channel 로컬 캐시를 초기화합니다. */
    public clearAll(): Promise<void> {
        return this.channelLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelUpdated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:update', detail => {
            callback(detail.data as DomainChannel);
        });
    }

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelDeleted(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:delete', detail => {
            callback(detail.data as DomainChannel);
        });
    }

    /** 서버로부터 신규 채널 생성(channel:create) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelCreated(callback: (channel: DomainChannel) => void): () => void {
        return this.onDomainEvent('channel:create', detail => {
            callback(detail.data as DomainChannel);
        });
    }

    private async fetchFromRemoteAndCache(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<ListResult<DomainChannel>> {
        const remote = await this.requestRemote<ListResult<ChannelView>>(
            ref => this.channelRemoteDataSource.fetchChannel(payload, ref),
            options
        );
        const domainList = (remote.list || []).map(item => toDomainChannel(item, this.getDomainScope()));
        await this.channelLocalDataSource.upsertChannels(domainList, this.getRepositoryContext());
        return { ...remote, list: domainList };
    ): Promise<ListResult<ChannelView>> {
        if (this.inflightFetchChannel) return this.inflightFetchChannel;

        this.inflightFetchChannel = (async () => {
            try {
                const remote = await this.requestRemote<ListResult<ChannelView>>(
                    ref => this.channelRemoteDataSource.fetchChannel(payload, ref),
                    options
                );
                await this.channelLocalDataSource.upsertChannels(remote.list || [], this.getRepositoryContext());
                return remote;
            } finally {
                this.inflightFetchChannel = null;
            }
        })();

        return this.inflightFetchChannel;
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('channel:create', detail => {
            this.runInBackground(
                () => this.channelLocalDataSource.upsertChannel(detail.data, this.getRepositoryContext()),
                'channel:create'
            );
        });
        this.onDomainEvent('channel:update', detail => {
            this.runInBackground(
                () => this.channelLocalDataSource.upsertChannel(detail.data, this.getRepositoryContext()),
                'channel:update'
            );
        });
        this.onDomainEvent('channel:delete', detail => {
            this.runInBackground(
                () => this.channelLocalDataSource.deleteChannel(detail.data.id || '', this.getRepositoryContext()),
                'channel:delete'
            );
        });
        this.onDomainEvent('channel:list', detail => {
            this.runInBackground(
                () => this.channelLocalDataSource.upsertChannels(detail.data.list || [], this.getRepositoryContext()),
                'channel:list'
            );
        });
    }
}
