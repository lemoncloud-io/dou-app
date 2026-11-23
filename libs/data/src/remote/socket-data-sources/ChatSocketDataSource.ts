import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatFeedResult, ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatSendPayload, DomainChat } from '../../domain';
import { toDomainChat } from '../../domain';
import type { DataContext } from '../../repositories/types';
import type { ChatSocketDomainGateway } from '../gateways';

export type ChatGetInput = Parameters<ChatSocketDomainGateway['get']>[0];
export type ChatUpdateInput = Parameters<ChatSocketDomainGateway['update']>[0];
export type ChatDeleteInput = Parameters<ChatSocketDomainGateway['delete']>[0];
export type ChatReactionInput = Parameters<ChatSocketDomainGateway['reaction']>[0];

export interface ChatFeedDomainResult {
    list: DomainChat[];
    cursorNo?: number;
    readNo?: number;
    total?: number;
    limit?: number;
}

export interface IChatSocketDataSource {
    sendChat(payload: ChatSendPayload, context: DataContext): Promise<DomainChat>;
    fetchChat(payload: ChatFeedInput, context: DataContext): Promise<ChatFeedDomainResult>;
    getChat(payload: ChatGetInput, context: DataContext): Promise<DomainChat>;
    updateChat(payload: ChatUpdateInput, context: DataContext): Promise<DomainChat>;
    deleteChat(payload: ChatDeleteInput, context: DataContext): Promise<DomainChat>;
    setReaction(payload: ChatReactionInput, context: DataContext): Promise<DomainChat>;
}

export class ChatSocketDataSource implements IChatSocketDataSource {
    constructor(private readonly gateway: ChatSocketDomainGateway) {}

    public async sendChat(payload: ChatSendPayload, context: DataContext): Promise<DomainChat> {
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
            limit: (remote as { limit?: number } | undefined)?.limit,
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

    public async setReaction(payload: ChatReactionInput, context: DataContext): Promise<DomainChat> {
        const remote = await this.gateway.reaction<ChatView>(payload);
        return toDomainChat((remote || {}) as ChatView, context);
    }
}
