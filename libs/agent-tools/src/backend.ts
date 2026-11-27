export interface AgentCloud {
    id: string;
    me: string;
}

export interface AgentRoom {
    id: string;
    title: string;
    stereo: string;
    memberIds: string[];
    chatNo: number;
    unread: number;
}

export interface AgentMessage {
    id: string;
    channelId: string;
    chatNo: number;
    ownerId: string;
    ownerName: string;
    content: string;
    stereo?: string;
    parentId?: string;
    mention: { userIds: string[]; all: boolean };
    createdAt: number;
}

export interface AgentMember {
    userId: string;
    name: string;
    role: string;
    left: boolean;
}

export interface AgentSearchQuery {
    channelId: string;
    keyword: string;
    since?: number;
    until?: number;
    limit: number;
}

export interface AgentSearchHit {
    message: AgentMessage;
    source: 'local' | 'relay';
}

export interface AgentSearchResult {
    hits: AgentSearchHit[];
    relayError?: string;
}

export interface AgentSendOptions {
    parentId?: string;
    mentionUserIds?: string[];
}

export interface AgentIncoming {
    message: AgentMessage;
    isDirect: boolean;
    repliesToMe: boolean;
}

export interface AgentBackend {
    cloud(): AgentCloud;
    rooms(): Promise<AgentRoom[]>;
    messages(channelId: string, page: { limit: number; before?: number }): Promise<AgentMessage[]>;
    send(channelId: string, text: string, options: AgentSendOptions): Promise<AgentMessage>;
    react(channelId: string, chatId: string, emoji: string, on: boolean): Promise<void>;
    search(query: AgentSearchQuery): Promise<AgentSearchResult>;
    members(channelId: string): Promise<AgentMember[]>;
    subscribe(listener: (incoming: AgentIncoming) => void): () => void;
}
