import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';

export interface IChatRemoteDataSource {
    /** 새로운 메시지를 서버로 전송합니다. */
    sendChat(payload: ChatSendInput): Promise<unknown>;
    /** 특정 채팅방의 이전 메시지 목록(피드)을 요청합니다. */
    fetchChat(payload: ChatFeedInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class ChatRemoteDataSource implements IChatRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async sendChat(payload: ChatSendInput): Promise<unknown> {
        return this.client.request('chat.send', payload);
    }

    public async fetchChat(payload: ChatFeedInput): Promise<unknown> {
        return this.client.request('chat.feed', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `chat:${action}` as 'chat:create' | 'chat:update' | 'chat:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
