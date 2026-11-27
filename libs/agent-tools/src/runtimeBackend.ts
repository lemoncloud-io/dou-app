import type {
    AgentBackend,
    AgentCloud,
    AgentIncoming,
    AgentMember,
    AgentMessage,
    AgentRoom,
    AgentSearchQuery,
    AgentSearchResult,
    AgentSendOptions,
} from './backend';

export interface RuntimeChat {
    id: string;
    channelId: string;
    chatNo: number;
    ownerId?: string;
    owner$?: { name?: string | null } | null;
    content?: string | null;
    stereo?: string | null;
    parentId?: string | null;
    mention$?: { userIds?: string[]; all?: boolean | number } | null;
    createdAtMs?: number;
}

export interface RuntimeChannel {
    id: string;
    name?: string | null;
    stereo?: string | null;
    memberIds?: string[] | null;
    chatNo?: number | null;
    unreadCount?: number | null;
    sid?: string | null;
}

export interface RuntimeMember {
    id: string;
    name?: string | null;
    nick?: string | null;
}

export interface RuntimeLastChat {
    channelId: string;
    lastNo: number;
    chat: RuntimeChat | null;
}

export interface RuntimeRepositories {
    chat: {
        cacheReadList(query: {
            channelId: string;
            limit?: number;
            cursorNo?: number;
        }): Promise<{ list: RuntimeChat[] } | null>;
        refreshList(query: { channelId: string; limit?: number; cursorNo?: number }): Promise<unknown>;
        setReaction(payload: { chatId: string; emoji: string; action: 'on' | 'off' }): Promise<unknown>;
        observeLastList(channelIds: string[], callback: (result: RuntimeLastChat[]) => void): () => void;
    };
    channel: {
        fetchList(query: Record<string, never>): Promise<{ list: RuntimeChannel[] }>;
    };
    user: {
        listPlaceMembers(query: {
            placeId: string;
            sessionPlaceId: string | null;
        }): Promise<{ members: RuntimeMember[] }>;
    };
}

export interface RuntimeSurface {
    session: {
        getActiveServerContext(): { kind: string; cloudId?: string; siteId: string | null };
        getIdentityContext(): { userId: string | null };
    };
    data: {
        getCloudRepositories(cid: string): RuntimeRepositories;
        sendChatInCloud(
            cid: string,
            payload: {
                channelId: string;
                content: string;
                parentId?: string;
                mention?: { userIds?: string[] };
            }
        ): Promise<RuntimeChat>;
    };
}

const RELAY_CLOUD = 'relay';
const SEARCH_WINDOW = 500;

const toMessage = (chat: RuntimeChat): AgentMessage => ({
    id: chat.id,
    channelId: chat.channelId,
    chatNo: chat.chatNo,
    ownerId: chat.ownerId ?? '',
    ownerName: chat.owner$?.name ?? '',
    content: chat.content ?? '',
    stereo: chat.stereo ?? undefined,
    parentId: chat.parentId ?? undefined,
    mention: { userIds: chat.mention$?.userIds ?? [], all: chat.mention$?.all === true || chat.mention$?.all === 1 },
    createdAt: chat.createdAtMs ?? 0,
});

const toRoom = (channel: RuntimeChannel): AgentRoom => ({
    id: channel.id,
    title: channel.name ?? '',
    stereo: channel.stereo ?? '',
    memberIds: channel.memberIds ?? [],
    chatNo: channel.chatNo ?? 0,
    unread: channel.unreadCount ?? 0,
});

export const runtimeBackend = (runtime: RuntimeSurface): AgentBackend => {
    const cloud = (): AgentCloud => {
        const server = runtime.session.getActiveServerContext();
        return {
            id: server.kind === 'cloud' && server.cloudId ? server.cloudId : RELAY_CLOUD,
            me: runtime.session.getIdentityContext().userId ?? '',
        };
    };
    const repositories = (): RuntimeRepositories => runtime.data.getCloudRepositories(cloud().id);

    const rooms = async (): Promise<AgentRoom[]> => {
        const result = await repositories().channel.fetchList({});
        return result.list.map(toRoom);
    };

    return {
        cloud,
        rooms,
        async messages(channelId, page) {
            const chat = repositories().chat;
            const query = { channelId, limit: page.limit, cursorNo: page.before };
            await chat.refreshList(query);
            const cached = await chat.cacheReadList(query);
            return (cached?.list ?? [])
                .filter(item => page.before === undefined || item.chatNo < page.before)
                .map(toMessage)
                .sort((a, b) => a.chatNo - b.chatNo)
                .slice(-page.limit);
        },
        async send(channelId: string, text: string, options: AgentSendOptions) {
            const sent = await runtime.data.sendChatInCloud(cloud().id, {
                channelId,
                content: text,
                ...(options.parentId ? { parentId: options.parentId } : {}),
                ...(options.mentionUserIds?.length ? { mention: { userIds: options.mentionUserIds } } : {}),
            });
            return toMessage(sent);
        },
        async react(_channelId, chatId, emoji, on) {
            await repositories().chat.setReaction({ chatId, emoji, action: on ? 'on' : 'off' });
        },
        async search(query: AgentSearchQuery): Promise<AgentSearchResult> {
            const needle = query.keyword.toLowerCase();
            const cached = await repositories().chat.cacheReadList({
                channelId: query.channelId,
                limit: SEARCH_WINDOW,
            });
            const hits = (cached?.list ?? [])
                .filter(chat => (chat.content ?? '').toLowerCase().includes(needle))
                .map(toMessage)
                .filter(
                    message =>
                        (query.since === undefined || message.createdAt >= query.since) &&
                        (query.until === undefined || message.createdAt <= query.until)
                )
                .slice(0, query.limit)
                .map(message => ({ message, source: 'local' as const }));
            return { hits, relayError: 'relay search is not exposed by the runtime; results are local cache only' };
        },
        async members(channelId): Promise<AgentMember[]> {
            const server = runtime.session.getActiveServerContext();
            const room = (await rooms()).find(item => item.id === channelId);
            const placeId = server.siteId ?? '';
            const result = await repositories().user.listPlaceMembers({ placeId, sessionPlaceId: server.siteId });
            const byId = new Map(result.members.map(member => [member.id, member]));
            return (room?.memberIds ?? []).map(userId => ({
                userId,
                name: byId.get(userId)?.name ?? byId.get(userId)?.nick ?? '',
                role: 'member',
                left: false,
            }));
        },
        subscribe(listener: (incoming: AgentIncoming) => void) {
            let stopped = false;
            let stop: (() => void) | undefined;
            const seen = new Map<string, number>();
            void rooms().then(list => {
                if (stopped) return;
                const me = cloud().me;
                const ids = list.map(room => room.id);
                const direct = new Set(list.filter(room => room.stereo === 'dm').map(room => room.id));
                stop = repositories().chat.observeLastList(ids, results => {
                    for (const entry of results) {
                        const previous = seen.get(entry.channelId);
                        seen.set(entry.channelId, entry.lastNo);
                        if (previous === undefined || entry.lastNo <= previous || !entry.chat) continue;
                        if (entry.chat.ownerId === me) continue;
                        const message = toMessage(entry.chat);
                        listener({
                            message,
                            isDirect: direct.has(entry.channelId),
                            repliesToMe: false,
                        });
                    }
                });
            });
            return () => {
                stopped = true;
                stop?.();
            };
        },
    };
};
