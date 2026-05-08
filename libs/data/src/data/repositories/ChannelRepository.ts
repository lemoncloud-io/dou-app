import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatMinePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { IChannelLocalDataSource } from '../local/data-sources';
import type { DomainEventMap, ListResult } from '../events/types';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import { createDomainListResult, type DomainChannel, type DomainListResult, toDomainChannel } from '../domain';

/** 채널 도메인의 Repository 공개 계약입니다. */
export interface IChannelRepository extends ILocalCacheMutationRepository<DomainChannel> {
    /** 내가 참여 중인 채널 목록을 조회합니다. */
    fetchChannel(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>>;

    /** 채널 이름/설정 등 채널 메타데이터를 수정합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 채널 삭제 또는 종료 요청을 수행합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

    /** 신규 채널을 생성하거나 대화를 시작합니다. */
    startChat(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<DomainChannel>;

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

    /** 로컬 캐시 기준 채널 목록을 스트림으로 구독합니다. */
    subscribeChannels(
        payload: ChatMinePayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 채널을 스트림으로 구독합니다. */
    subscribeChannel(id: string, callback: (channel: DomainChannel | null) => void): () => void;
}

/** Remote channel API와 local channel cache를 중재합니다. */
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

    public async fetchChannel(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        return this.fetchWithCachePolicy<DomainListResult<DomainChannel>>({
            options,
            backgroundLabel: 'channel',
            fetchLocal: () => this.channelLocalDataSource.fetchChannel(payload, this.getRepositoryContext()),
            fetchRemote: remoteOptions => this.fetchFromRemoteAndCache(payload, remoteOptions),
            isLocalValid: local => (local.list || []).length > 0,
            fallback: () =>
                createDomainListResult(
                    {
                        list: [],
                        limit: (payload as { limit?: number }).limit,
                        page: (payload as { page?: number }).page,
                        total: 0,
                    },
                    { source: 'fallback' }
                ),
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
    }

    /** chat:leave 요청을 수행하고 응답을 기다립니다. */
    public async leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<DomainChannel> {
        const channel = await this.requestRemote<ChannelView>(
            ref => this.channelRemoteDataSource.leaveChannel(payload, ref),
            options
        );
        const domainChannel = toDomainChannel(channel, this.getDomainScope());
        await this.channelLocalDataSource.deleteChannel(
            domainChannel.id || (payload as { channelId?: string }).channelId || '',
            this.getRepositoryContext()
        );
        return domainChannel;
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

    /** 로컬 채널 목록 스냅샷을 지속 구독합니다. */
    public subscribeChannels(
        payload: ChatMinePayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void {
        return this.channelLocalDataSource.subscribeChannelList(payload, callback, this.getRepositoryContext());
    }

    /** 로컬 단일 채널 스냅샷을 지속 구독합니다. */
    public subscribeChannel(id: string, callback: (channel: DomainChannel | null) => void): () => void {
        return this.channelLocalDataSource.subscribeChannel(id, callback, this.getRepositoryContext());
    }

    /** 로컬 캐시에 채널을 생성/병합합니다. (remote 호출 없음) */
    public cacheCreate(item: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.upsertChannel(item, this.getRepositoryContext());
    }

    /** 로컬 캐시의 채널 일부 필드를 갱신합니다. (remote 호출 없음) */
    public cacheUpdate(id: string, patch: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.updateChannelPartial(id, patch, this.getRepositoryContext());
    }

    /** 로컬 캐시에서 채널을 삭제합니다. (remote 호출 없음) */
    public cacheDelete(id: string): Promise<void> {
        return this.channelLocalDataSource.deleteChannel(id, this.getRepositoryContext());
    }

    /** 로컬 캐시에 채널을 일괄 생성/병합합니다. (remote 호출 없음) */
    public cacheBulkCreate(items: Array<Partial<DomainChannel>>): Promise<void> {
        return this.channelLocalDataSource.upsertChannels(items, this.getRepositoryContext());
    }

    /** 로컬 캐시의 채널 일부 필드를 일괄 갱신합니다. (remote 호출 없음) */
    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainChannel>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.channelLocalDataSource.updateChannelPartial(item.id, item.patch, this.getRepositoryContext())
                )
        );
    }

    private async fetchFromRemoteAndCache(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<DomainListResult<DomainChannel>> {
        const remote = await this.requestRemote<ListResult<ChannelView>>(
            ref => this.channelRemoteDataSource.fetchChannel(payload, ref),
            options
        );
        const domainList = (remote.list || []).map(item => toDomainChannel(item, this.getDomainScope()));
        await this.channelLocalDataSource.upsertChannels(domainList, this.getRepositoryContext());
        return createDomainListResult({ ...remote, list: domainList }, { source: 'remote' });
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
