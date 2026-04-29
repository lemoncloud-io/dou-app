import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, ListResult, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type {
    ChatMinePayload,
    ChatUpdateChannelPayload,
    ChatDeleteChannelPayload,
    ChatStartPayload,
    ChatInvitePayload,
} from '@lemoncloud/chatic-sockets-api';

export interface IChannelRemoteDataSource {
    /** 내가 참여 중인 채널 목록을 서버에 요청합니다. */
    fetchChannel(payload: ChatMinePayload, ref?: string): void;
    /** 채널의 정보(이름, 설정 등) 수정을 요청합니다. */
    updateChannel(payload: ChatUpdateChannelPayload, ref?: string): void;
    /** 채널 삭제(또는 종료)를 요청합니다. */
    deleteChannel(payload: ChatDeleteChannelPayload, ref?: string): void;
    /** 새로운 채팅방을 시작하거나 초기 상태를 요청합니다. */
    startChat(payload: ChatStartPayload, ref?: string): void;
    /** 채널에 특정 유저를 초대합니다. */
    inviteUser(payload: ChatInvitePayload, ref?: string): void;
}

export class ChannelRemoteDataSource implements IChannelRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('channel:create', detail => {
            this.domainEventBus.emit('channel:create', {
                data: detail.payload as ChannelView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('channel:update', detail => {
            this.domainEventBus.emit('channel:update', {
                data: detail.payload as ChannelView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('channel:delete', detail => {
            this.domainEventBus.emit('channel:delete', {
                data: detail.payload as ChannelView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('channel:read', detail => {
            this.domainEventBus.emit('channel:list', {
                data: detail.payload as ListResult<ChannelView>,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('channel:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'channel',
                message: detail.payload.error || 'Unknown Channel Error',
                ref: detail.ref,
            });
        });
    }

    public fetchChannel(payload: ChatMinePayload, ref?: string) {
        this.wssClient.send('chat', 'mine', payload, ref);
    }

    public updateChannel(payload: ChatUpdateChannelPayload, ref?: string) {
        this.wssClient.send('chat', 'update-channel', payload, ref);
    }

    public deleteChannel(payload: ChatDeleteChannelPayload, ref?: string) {
        this.wssClient.send('chat', 'delete-channel', payload, ref);
    }

    public startChat(payload: ChatStartPayload, ref?: string) {
        this.wssClient.send('chat', 'start', payload, ref);
    }

    public inviteUser(payload: ChatInvitePayload, ref?: string) {
        this.wssClient.send('chat', 'invite', payload, ref);
    }
}
