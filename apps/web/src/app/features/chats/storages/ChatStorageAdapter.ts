import type { ClientMessage } from '@chatic/app-messages';

export type { ClientMessage as Message };

export interface ChatStorageAdapter {
    save(userId: string, channelId: string, message: ClientMessage): Promise<void>;
    load(userId: string, channelId: string): Promise<ClientMessage[]>;
    update(userId: string, channelId: string, chatNo: number, readerUserId: string): Promise<void>;
    clear(userId: string, channelId: string): Promise<void>;
    countUnread(userId: string, channelId: string): Promise<number>;
    markAllRead(userId: string, channelId: string): Promise<void>;
}
