import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { ChatSendPayload, ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';

export interface IChatRemoteDataSource {
    /** 새로운 메시지를 서버로 전송합니다. */
    sendChat(payload: ChatSendPayload, ref?: string): void;
    /** 특정 채팅방의 이전 메시지 목록(피드)을 요청합니다. */
    fetchChat(payload: ChatFeedPayload, ref?: string): void;
}

export class ChatRemoteDataSource implements IChatRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('chat:create', detail => {
            this.domainEventBus.emit('chat:create', {
                data: detail.payload as ChatView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('chat:feed', detail => {
            this.domainEventBus.emit('chat:list', {
                data: detail.payload as ChatFeedResult,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('chat:delete', detail => {
            this.domainEventBus.emit('chat:delete', {
                data: detail.payload as ChatView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('chat:update', detail => {
            this.domainEventBus.emit('chat:update', {
                data: detail.payload as ChatView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('chat:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'chat',
                message: detail.payload.error || 'Unknown Chat Error',
                ref: detail.ref,
            });
        });
    }

    public sendChat(payload: ChatSendPayload, ref?: string) {
        this.wssClient.send('chat', 'send', payload, ref);
    }

    public fetchChat(payload: ChatFeedPayload, ref?: string) {
        this.wssClient.send('chat', 'feed', payload, ref);
    }
}
