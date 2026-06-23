import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatDomainGateway } from '../gateways';

export type ChatGetInput = Parameters<ChatDomainGateway['get']>[0];
export type ChatUpdateInput = Parameters<ChatDomainGateway['update']>[0];
export type ChatDeleteInput = Parameters<ChatDomainGateway['delete']>[0];

export interface IChatRemoteDataSource {
    /** 새로운 메시지를 서버로 전송합니다. */
    sendChat(payload: ChatSendInput): Promise<ChatView>;
    /** 특정 채팅방의 이전 메시지 목록(피드)을 요청합니다. */
    fetchChat(payload: ChatFeedInput): Promise<ChatFeedResult>;
    /** 단일 chat 엔티티를 조회합니다. */
    getChat(payload: ChatGetInput): Promise<ChatView>;
    /** 단일 chat 엔티티를 수정합니다. */
    updateChat(payload: ChatUpdateInput): Promise<ChatView>;
    /** 단일 chat 엔티티를 삭제합니다. */
    deleteChat(payload: ChatDeleteInput): Promise<ChatView>;
}

export class ChatRemoteDataSource implements IChatRemoteDataSource {
    constructor(private readonly gateway: ChatDomainGateway) {}

    public async sendChat(payload: ChatSendInput): Promise<ChatView> {
        return this.gateway.send(payload);
    }

    public async fetchChat(payload: ChatFeedInput): Promise<ChatFeedResult> {
        return this.gateway.feed(payload);
    }

    public async getChat(payload: ChatGetInput): Promise<ChatView> {
        return this.gateway.get(payload);
    }

    public async updateChat(payload: ChatUpdateInput): Promise<ChatView> {
        return this.gateway.update(payload);
    }

    public async deleteChat(payload: ChatDeleteInput): Promise<ChatView> {
        return this.gateway.delete(payload);
    }
}
