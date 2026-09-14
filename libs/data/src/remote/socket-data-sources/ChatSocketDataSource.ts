import type { ChatFeedInput, ChatSendInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { DomainChat } from '../../domain';
import { toDomainChat } from '../../domain';
import type { DataContext } from '../../repositories-v2/types';
import type { ChatSocketDomainGateway } from '../gateways';

export type ChatGetInput = Parameters<ChatSocketDomainGateway['get']>[0];
export type ChatUpdateInput = Parameters<ChatSocketDomainGateway['update']>[0];
export type ChatDeleteInput = Parameters<ChatSocketDomainGateway['delete']>[0];
export type ChatReactionInput = Parameters<ChatSocketDomainGateway['reaction']>[0];

/** Result of a chat feed: domain rows plus the server's pagination metadata. */
export interface ChatFeedDomainResult {
    list: DomainChat[];
    cursorNo?: number;
    readNo?: number;
    total?: number;
}

export interface IChatSocketDataSource {
    /** 새로운 메시지를 서버로 전송하고 도메인 모델로 반환합니다. */
    sendChat(payload: ChatSendInput, context: DataContext): Promise<DomainChat>;
    /** 특정 채팅방의 이전 메시지 목록(피드)을 요청하고 도메인 모델로 반환합니다. */
    fetchChat(payload: ChatFeedInput, context: DataContext): Promise<ChatFeedDomainResult>;
    /** 단일 chat 엔티티를 조회합니다. */
    getChat(payload: ChatGetInput, context: DataContext): Promise<DomainChat>;
    /** 단일 chat 엔티티를 수정합니다. */
    updateChat(payload: ChatUpdateInput, context: DataContext): Promise<DomainChat>;
    /** 단일 chat 엔티티를 삭제합니다. */
    deleteChat(payload: ChatDeleteInput, context: DataContext): Promise<DomainChat>;
    /** Publishes a reaction on/off event. Resolves to the event chat, not the target. */
    setReaction(payload: ChatReactionInput, context: DataContext): Promise<DomainChat>;
}

/**
 * Chat remote source. Single boundary where chat API views become domain
 * models; callers receive domain shapes only. The request-time `context`
 * is supplied by the caller to keep a late response on its original scope.
 */
export class ChatSocketDataSource implements IChatSocketDataSource {
    constructor(private readonly gateway: ChatSocketDomainGateway) {}

    public async sendChat(payload: ChatSendInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.send<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }

    public async fetchChat(payload: ChatFeedInput, context: DataContext): Promise<ChatFeedDomainResult> {
        const remote = await this.gateway.feed<ChatFeedResult>(payload);
        return {
            list: ((remote?.list || []) as ChatView[]).map(item => toDomainChat(item, context)),
            cursorNo: remote?.cursorNo,
            readNo: remote?.readNo,
            total: remote?.total,
        };
    }

    public async getChat(payload: ChatGetInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.get<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }

    public async updateChat(payload: ChatUpdateInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.update<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }

    public async deleteChat(payload: ChatDeleteInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.delete<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }

    // The server stores no reaction state — it publishes an event chat that carries the
    // reaction on `reaction$`, and clients fold the events to derive who reacted with
    // what. So the row that comes back is the event, never the message reacted to.
    public async setReaction(payload: ChatReactionInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.reaction<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }
}
