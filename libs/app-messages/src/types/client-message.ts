export interface ClientMessage {
    id: string;
    content: string;
    timestamp: Date;
    ownerId: string;
    ownerName?: string;
    readBy?: string[];
    chatNo?: number;
    isRead?: boolean;
    isSystem?: boolean;
}
