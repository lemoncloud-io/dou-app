import { runtime } from '@chatic/runtime';

import { runtimeBackend } from './runtimeBackend';
import type { RuntimeChat, RuntimeChannel, RuntimeLastChat, RuntimeSurface } from './runtimeBackend';

const chat = (overrides: Partial<RuntimeChat> = {}): RuntimeChat => ({
    id: 'r1:5',
    channelId: 'r1',
    chatNo: 5,
    ownerId: 'u2',
    owner$: { name: 'Mina' },
    content: 'hi',
    createdAtMs: 500,
    ...overrides,
});

const channel = (overrides: Partial<RuntimeChannel> = {}): RuntimeChannel => ({
    id: 'r1',
    name: 'General',
    stereo: 'room',
    memberIds: ['u1', 'u2'],
    chatNo: 5,
    unreadCount: 2,
    ...overrides,
});

const build = (options: { chats?: RuntimeChat[]; channels?: RuntimeChannel[] } = {}) => {
    const calls = {
        sent: [] as unknown[],
        reactions: [] as unknown[],
        refreshed: [] as unknown[],
        cids: [] as string[],
    };
    let observer: ((result: RuntimeLastChat[]) => void) | undefined;
    let unobserved = 0;
    const repositories = {
        chat: {
            cacheReadList: async () => ({
                list: options.chats ?? [chat(), chat({ id: 'r1:4', chatNo: 4, content: 'other' })],
            }),
            refreshList: async (query: unknown) => {
                calls.refreshed.push(query);
            },
            setReaction: async (payload: unknown) => {
                calls.reactions.push(payload);
            },
            observeLastList: (_ids: string[], callback: (result: RuntimeLastChat[]) => void) => {
                observer = callback;
                return () => {
                    unobserved += 1;
                };
            },
        },
        channel: { fetchList: async () => ({ list: options.channels ?? [channel()] }) },
        user: {
            listPlaceMembers: async () => ({
                members: [
                    { id: 'u1', name: 'Me' },
                    { id: 'u2', nick: 'Mina' },
                ],
            }),
        },
    };
    const surface: RuntimeSurface = {
        session: {
            getActiveServerContext: () => ({ kind: 'cloud', cloudId: 'c1', siteId: 's1' }),
            getIdentityContext: () => ({ userId: 'u1' }),
        },
        data: {
            getCloudRepositories: cid => {
                calls.cids.push(cid);
                return repositories;
            },
            sendChatInCloud: async (cid, payload) => {
                calls.cids.push(cid);
                calls.sent.push(payload);
                return chat({ id: 'r1:6', chatNo: 6, ownerId: 'u1', content: payload.content });
            },
        },
    };
    return {
        backend: runtimeBackend(surface),
        calls,
        emit: (r: RuntimeLastChat[]) => observer?.(r),
        unobserved: () => unobserved,
    };
};

describe('runtimeBackend', () => {
    it('stays assignable from the real runtime facade', () => {
        const surface: RuntimeSurface = runtime;
        expect(typeof runtimeBackend(surface).cloud).toBe('function');
    });

    it('lists rooms through the channel repository of the active cloud', async () => {
        const { backend, calls } = build();
        expect(backend.cloud()).toEqual({ id: 'c1', me: 'u1' });
        expect(await backend.rooms()).toEqual([
            { id: 'r1', title: 'General', stereo: 'room', memberIds: ['u1', 'u2'], chatNo: 5, unread: 2 },
        ]);
        expect(calls.cids).toContain('c1');
    });

    it('reads messages from the chat repository cache after a refresh', async () => {
        const { backend, calls } = build();
        const messages = await backend.messages('r1', { limit: 10 });
        expect(calls.refreshed).toHaveLength(1);
        expect(messages.map(message => message.id)).toEqual(['r1:4', 'r1:5']);
        expect(messages[1]).toEqual(expect.objectContaining({ ownerName: 'Mina', content: 'hi', createdAt: 500 }));
    });

    it('sends through sendChatInCloud with parent and mention', async () => {
        const { backend, calls } = build();
        const sent = await backend.send('r1', '[AI] yo', { parentId: 'r1:2', mentionUserIds: ['u2'] });
        expect(calls.sent).toEqual([
            { channelId: 'r1', content: '[AI] yo', parentId: 'r1:2', mention: { userIds: ['u2'] } },
        ]);
        expect(sent.id).toBe('r1:6');
    });

    it('sets and removes reactions through the chat repository', async () => {
        const { backend, calls } = build();
        await backend.react('r1', 'r1:5', '👍', true);
        await backend.react('r1', 'r1:5', '👍', false);
        expect(calls.reactions).toEqual([
            { chatId: 'r1:5', emoji: '👍', action: 'on' },
            { chatId: 'r1:5', emoji: '👍', action: 'off' },
        ]);
    });

    it('searches the local cache only and says so', async () => {
        const { backend } = build();
        const result = await backend.search({ channelId: 'r1', keyword: 'hi', limit: 5 });
        expect(result.hits.map(hit => hit.message.id)).toEqual(['r1:5']);
        expect(result.hits[0].source).toBe('local');
        expect(result.relayError).toMatch(/local cache only/);
    });

    it('names members from the place member list', async () => {
        const { backend } = build();
        expect(await backend.members('r1')).toEqual([
            { userId: 'u1', name: 'Me', role: 'member', left: false },
            { userId: 'u2', name: 'Mina', role: 'member', left: false },
        ]);
    });

    it('emits only new messages from others after the first observation', async () => {
        const { backend, emit, unobserved } = build();
        const seen: string[] = [];
        const stop = backend.subscribe(incoming => seen.push(incoming.message.id));
        await new Promise(resolve => setTimeout(resolve, 0));
        emit([{ channelId: 'r1', lastNo: 5, chat: chat() }]);
        emit([{ channelId: 'r1', lastNo: 6, chat: chat({ id: 'r1:6', chatNo: 6 }) }]);
        emit([{ channelId: 'r1', lastNo: 7, chat: chat({ id: 'r1:7', chatNo: 7, ownerId: 'u1' }) }]);
        expect(seen).toEqual(['r1:6']);
        stop();
        expect(unobserved()).toBe(1);
    });
});
