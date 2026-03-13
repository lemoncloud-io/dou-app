import type { ChatReadBody, ChatSendBody, ChatView, JoinView } from '@lemoncloud/chatic-socials-api';

export type { ChatReadBody, ChatSendBody, ChatView, JoinView };

export interface ClientChatView extends ChatView {
    /**
     * ChatView.id
     */
    id: string;
    /**
     * ChatView.content
     */
    content: string;
    /**
     * from ChatView.createdAt
     */
    timestamp: Date;
    /**
     * from ChatView.ownerId
     */
    ownerId: string;
    /**
     * from ChatView.owner$?.name
     */
    ownerName?: string;
    readBy?: string[];
    /**
     * from ChatView.chatNo
     */
    chatNo?: number;
    isRead?: boolean;
    isSystem?: boolean;
}

export const toClientChatView = (chat: ChatView): ClientChatView => {
    return {
        ...chat,
        id: chat.id || '',
        content: chat.content || '',
        timestamp: chat?.createdAt ? new Date(chat.createdAt) : new Date(),
        ownerId: chat.ownerId || '',
        ownerName: chat.owner$?.name || '알 수 없음',
        chatNo: chat.chatNo,
        isSystem: chat.stereo === 'system',
    };
};

export const toChatView = (clientChat: ClientChatView): ChatView => ({ ...clientChat });
