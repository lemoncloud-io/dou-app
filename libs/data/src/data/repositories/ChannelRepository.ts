import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatMinePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../events/types';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import {
    BaseRepository,
    type RepositoryContextProvider,
    type RepositoryDomainEventBus,
    type RepositoryRequestOptions,
} from './types';

/**
 * 채널 도메인의 Repository 공개 계약입니다.
 * 채널 목록 조회, 채널 생성/수정/삭제, 멤버 초대 요청을 담당합니다.
 */
export interface IChannelRepository {
    /** 내가 참여 중인 채널 목록을 조회합니다. */
    fetchChannel(payload: ChatMinePayload, options?: RepositoryRequestOptions): Promise<ListResult<ChannelView>>;

    /** 채널 이름/설정 등 채널 메타데이터를 수정합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 채널 삭제 또는 종료 요청을 수행합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 신규 채널을 생성하거나 대화를 시작합니다. */
    startChat(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 기존 채널에 사용자를 초대합니다. */
    inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 채널에서 나갑니다. */
    leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<ChannelView>;

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelUpdated(callback: (channel: ChannelView) => void): () => void;

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    onChannelDeleted(callback: (channel: ChannelView) => void): () => void;
}

/**
 * ChannelRemoteDataSource를 감싸는 채널 Repository 구현체입니다.
 * 모든 메서드는 data source 발신 후 request manager가 domain event 응답을 resolve하도록 연결합니다.
 */
export class ChannelRepository extends BaseRepository implements IChannelRepository {
    /** 동시 다발적 fetchChannel 호출을 하나의 WebSocket 요청으로 합치기 위한 inflight Promise 맵 (placeId별) */
    private inflightFetchChannel = new Map<string, Promise<ListResult<ChannelView>>>();

    constructor(
        private readonly channelDataSource: IChannelRemoteDataSource,
        requestManager: ISocketRequestManager,
        context?: RepositoryContextProvider,
        domainEventBus?: RepositoryDomainEventBus
    ) {
        super(requestManager, context, domainEventBus);
    }

    /** chat:mine 요청을 수행하고 응답을 기다립니다. 동일 placeId의 동시 호출은 하나로 합쳐집니다. */
    public fetchChannel(
        payload: ChatMinePayload,
        options?: RepositoryRequestOptions
    ): Promise<ListResult<ChannelView>> {
        const key = payload.placeId ?? '';
        const inflight = this.inflightFetchChannel.get(key);
        if (inflight) return inflight;

        const promise = this.requestRemote<ListResult<ChannelView>>(
            ref => this.channelDataSource.fetchChannel(payload, ref),
            options
        ).finally(() => {
            this.inflightFetchChannel.delete(key);
        });
        this.inflightFetchChannel.set(key, promise);
        return promise;
    }

    /** chat:update-channel 요청을 수행하고 응답을 기다립니다. */
    public updateChannel(payload: ChatUpdateChannelPayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelDataSource.updateChannel(payload, ref), options);
    }

    /** chat:delete-channel 요청을 수행하고 응답을 기다립니다. */
    public deleteChannel(payload: ChatDeleteChannelPayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelDataSource.deleteChannel(payload, ref), options);
    }

    /** chat:start 요청을 수행하고 응답을 기다립니다. */
    public startChat(payload: ChatStartPayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelDataSource.startChat(payload, ref), options);
    }

    /** chat:invite 요청을 수행하고 응답을 기다립니다. */
    public inviteChannel(payload: ChatInvitePayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelDataSource.inviteChannel(payload, ref), options);
    }

    /** chat:leave 요청을 수행하고 응답을 기다립니다. */
    public leaveChannel(payload: ChatLeavePayload, options?: RepositoryRequestOptions): Promise<ChannelView> {
        return this.requestRemote(ref => this.channelDataSource.leaveChannel(payload, ref), options);
    }

    /** 서버로부터 채널 정보 변경(channel:update) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelUpdated(callback: (channel: ChannelView) => void): () => void {
        return this.onDomainEvent('channel:update', data => {
            callback(data.data);
        });
    }

    /** 서버로부터 채널 삭제(channel:delete) 이벤트를 수신하는 리스너를 등록합니다. */
    public onChannelDeleted(callback: (channel: ChannelView) => void): () => void {
        return this.onDomainEvent('channel:delete', data => {
            callback(data.data);
        });
    }
}
