import type {
    AgentBackend,
    AgentCloud,
    AgentIncoming,
    AgentMember,
    AgentMessage,
    AgentRoom,
    AgentSearchHit,
    AgentSendOptions,
} from '../backend';

export interface FakeBackendOptions {
    cloud?: AgentCloud;
    rooms?: AgentRoom[];
    messages?: AgentMessage[];
    members?: Record<string, AgentMember[]>;
    searchHits?: AgentSearchHit[];
    relayError?: string;
}

export interface SentCall {
    channelId: string;
    text: string;
    options: AgentSendOptions;
}

export interface ReactCall {
    channelId: string;
    chatId: string;
    emoji: string;
    on: boolean;
}

export interface FakeBackend extends AgentBackend {
    sent: SentCall[];
    reacted: ReactCall[];
    emit(incoming: AgentIncoming): void;
}

export const fakeMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
    id: 'r1:1',
    channelId: 'r1',
    chatNo: 1,
    ownerId: 'u2',
    ownerName: 'Mina',
    content: 'hello',
    mention: { userIds: [], all: false },
    createdAt: 1000,
    ...overrides,
});

export const fakeRoom = (overrides: Partial<AgentRoom> = {}): AgentRoom => ({
    id: 'r1',
    title: 'General',
    stereo: 'room',
    memberIds: ['u1', 'u2'],
    chatNo: 1,
    unread: 0,
    ...overrides,
});

export const fakeBackend = (options: FakeBackendOptions = {}): FakeBackend => {
    const listeners = new Set<(incoming: AgentIncoming) => void>();
    const stored = options.messages ?? [];
    const sent: SentCall[] = [];
    const reacted: ReactCall[] = [];
    return {
        sent,
        reacted,
        cloud: () => options.cloud ?? { id: 'cloud1', me: 'u1' },
        rooms: async () => options.rooms ?? [],
        messages: async (channelId, page) =>
            stored
                .filter(
                    message =>
                        message.channelId === channelId && (page.before === undefined || message.chatNo < page.before)
                )
                .slice(-page.limit),
        send: async (channelId, text, sendOptions) => {
            sent.push({ channelId, text, options: sendOptions });
            return fakeMessage({
                id: `${channelId}:${sent.length + 100}`,
                channelId,
                chatNo: sent.length + 100,
                ownerId: 'u1',
                ownerName: 'Me',
                content: text,
                parentId: sendOptions.parentId,
                mention: { userIds: sendOptions.mentionUserIds ?? [], all: false },
            });
        },
        react: async (channelId, chatId, emoji, on) => {
            reacted.push({ channelId, chatId, emoji, on });
        },
        search: async () => ({ hits: options.searchHits ?? [], relayError: options.relayError }),
        members: async channelId => options.members?.[channelId] ?? [],
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emit(incoming) {
            listeners.forEach(listener => listener(incoming));
        },
    };
};
