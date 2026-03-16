import type { ClientChatView } from '@chatic/chats';

export interface ChatStorageAdapter {
    save(userId: string, channelId: string, message: ClientChatView): Promise<void>;
    load(userId: string, channelId: string): Promise<ClientChatView[]>;
    update(userId: string, channelId: string, chatNo: number, readerUserId: string): Promise<void>;
    clear(userId: string, channelId: string): Promise<void>;
    countUnread(userId: string, channelId: string): Promise<number>;
    markAllRead(userId: string, channelId: string): Promise<void>;
}
