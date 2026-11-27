import { createAgentTools } from './registry';
import type { Settings } from './settings';
import { fakeBackend, fakeMessage, findTool } from './testing';

const config: Settings = { tier: 'read', allowRooms: ['r1'], rateLimit: { perMinute: 10, perHour: 100 } };

const setup = (settings: Settings = config) => {
    const backend = fakeBackend();
    const { tools, dispose } = createAgentTools({ backend, getSettings: () => settings });
    const call = (name: string, params: unknown = {}) => findTool(tools, name).handler(params);
    return { backend, call, dispose };
};

type Page = { events: Array<{ seq: number; kind: string; message: { id: string; kinds: string[] } }>; cursor: number };

const incoming = (id: string, channelId = 'r1', extra: Record<string, unknown> = {}) => ({
    message: fakeMessage({ id, channelId, ...extra }),
    isDirect: false,
    repliesToMe: false,
});

describe('events', () => {
    it('lists new messages in allowed rooms with a monotonic cursor', async () => {
        const { backend, call } = setup();
        backend.emit(incoming('r1:1'));
        backend.emit(incoming('r1:2'));
        const first = (await call('events_list')) as Page;
        expect(first.events.map(event => [event.seq, event.kind])).toEqual([
            [1, 'room'],
            [2, 'room'],
        ]);
        expect(first.cursor).toBe(2);
        backend.emit(incoming('r1:3'));
        const next = (await call('events_list', { since: first.cursor })) as Page;
        expect(next.events.map(event => event.seq)).toEqual([3]);
        expect((await call('events_list', { since: 3 })) as Page).toMatchObject({ events: [], cursor: 3 });
    });

    it('classifies mentions, direct messages and replies, and drops own and unrelated messages', async () => {
        const { backend, call } = setup();
        backend.emit(incoming('r1:1', 'r1', { mention: { userIds: ['u1'], all: false } }));
        backend.emit({ ...incoming('r1:2', 'r1'), isDirect: true });
        backend.emit({ ...incoming('r1:3', 'r1'), repliesToMe: true });
        backend.emit(incoming('r9:4', 'r9'));
        backend.emit(incoming('r1:5', 'r1', { ownerId: 'u1' }));
        const page = (await call('events_list')) as Page;
        expect(page.events.map(event => [event.message.id, event.kind])).toEqual([
            ['r1:1', 'mention'],
            ['r1:2', 'dm'],
            ['r1:3', 'thread_reply'],
        ]);
    });

    it('hides mentions and direct messages of rooms outside the allow-list', async () => {
        const { backend, call } = setup();
        backend.emit(incoming('r9:1', 'r9', { mention: { userIds: ['u1'], all: false } }));
        backend.emit({ ...incoming('r9:2', 'r9'), isDirect: true });
        expect(((await call('events_list')) as Page).events).toEqual([]);
    });

    it('events_wait returns at once when events exist, wakes on a new one, and times out empty', async () => {
        const { backend, call } = setup();
        const waiting = call('events_wait', { since: 0, timeoutMs: 2000 }) as Promise<Page>;
        backend.emit(incoming('r1:1'));
        expect((await waiting).events).toHaveLength(1);
        expect(((await call('events_wait', { since: 0, timeoutMs: 2000 })) as Page).events).toHaveLength(1);
        expect(await call('events_wait', { since: 1, timeoutMs: 20 })).toEqual({ events: [], cursor: 1 });
    });

    it('keeps only the newest entries and stops listening after dispose', async () => {
        const { backend, call, dispose } = setup();
        for (let i = 1; i <= 520; i += 1) backend.emit(incoming(`r1:${i}`));
        const page = (await call('events_list', { since: 0, limit: 200 })) as Page;
        expect(page.events[0].seq).toBe(21);
        dispose();
        backend.emit(incoming('r1:999'));
        expect(((await call('events_list', { since: 520 })) as Page).events).toEqual([]);
    });

    it('events_list refuses when the tier is off', async () => {
        const { call } = setup({ ...config, tier: 'off' });
        await expect(call('events_list')).rejects.toMatchObject({ code: 'tier_off' });
    });
});
