export interface Message {
    id: string;
    content: string;
    timestamp: Date;
    ownerId: string;
    ownerName?: string;
    readCount?: number;
    chatNo?: number;
    isRead?: boolean;
}

export interface ChatStorageAdapter {
    save(userId: string, channelId: string, message: Message): Promise<void>;
    load(userId: string, channelId: string): Promise<Message[]>;
    update(userId: string, channelId: string, chatNo: number, newReadCount: number): Promise<void>;
    clear(userId: string, channelId: string): Promise<void>;
    countUnread(userId: string, channelId: string): Promise<number>;
    markAllRead(userId: string, channelId: string): Promise<void>;
}
