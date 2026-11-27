import { createAgentTools } from './registry';
import type { Settings } from './settings';
import { fakeBackend } from './testing';

const settings = (overrides: Partial<Settings> = {}): Settings => ({
    tier: 'write',
    allowRooms: ['r1'],
    rateLimit: { perMinute: 2, perHour: 100 },
    ...overrides,
});

const setup = (config: Settings = settings()) => {
    const backend = fakeBackend();
    let clock = 0;
    const { tools } = createAgentTools({ backend, getSettings: () => config, now: () => clock });
    const call = (name: string, params: unknown) => tools.find(tool => tool.name === name)!.handler(params);
    return { backend, call, advance: (ms: number) => (clock += ms) };
};

describe('write tools', () => {
    it('AI prefix: send, reply and mention hand the backend a text with [AI] exactly once', async () => {
        const { backend, call, advance } = setup(settings({ rateLimit: { perMinute: 10, perHour: 100 } }));
        await call('message_send', { channelId: 'r1', text: 'hi' });
        await call('message_send', { channelId: 'r1', text: '[AI] already' });
        await call('thread_reply', { channelId: 'r1', parentId: 'r1:1', text: 'yo' });
        await call('mention_send', { channelId: 'r1', text: 'ping', userIds: ['u2'] });
        advance(1);
        expect(backend.sent).toEqual([
            { channelId: 'r1', text: '[AI] hi', options: {} },
            { channelId: 'r1', text: '[AI] already', options: {} },
            { channelId: 'r1', text: '[AI] yo', options: { parentId: 'r1:1' } },
            { channelId: 'r1', text: '[AI] ping', options: { mentionUserIds: ['u2'] } },
        ]);
    });

    it('the read tier refuses every write tool and the backend is never called', async () => {
        const { backend, call } = setup(settings({ tier: 'read' }));
        const calls: Array<[string, unknown]> = [
            ['message_send', { channelId: 'r1', text: 'x' }],
            ['thread_reply', { channelId: 'r1', parentId: 'p', text: 'x' }],
            ['reaction_set', { channelId: 'r1', chatId: 'c', emoji: 'x' }],
            ['mention_send', { channelId: 'r1', text: 'x', userIds: ['u2'] }],
        ];
        for (const [name, params] of calls) {
            await expect(call(name, params)).rejects.toMatchObject({ code: 'tier_read_only' });
        }
        expect(backend.sent).toEqual([]);
        expect(backend.reacted).toEqual([]);
    });

    it('an unlisted room is refused', async () => {
        const { backend, call } = setup();
        await expect(call('message_send', { channelId: 'r9', text: 'x' })).rejects.toMatchObject({
            code: 'room_not_allowed',
        });
        expect(backend.sent).toEqual([]);
    });

    it('rate limit: the third write inside a minute is refused', async () => {
        const { call, advance } = setup();
        await call('message_send', { channelId: 'r1', text: 'a' });
        await call('message_send', { channelId: 'r1', text: 'b' });
        await expect(call('message_send', { channelId: 'r1', text: 'c' })).rejects.toMatchObject({
            code: 'rate_limited',
        });
        advance(60_001);
        await expect(call('message_send', { channelId: 'r1', text: 'd' })).resolves.toMatchObject({ channelId: 'r1' });
    });

    it('reaction_set defaults on to true and passes off through', async () => {
        const { backend, call } = setup();
        await expect(call('reaction_set', { channelId: 'r1', chatId: 'r1:4', emoji: 'x' })).resolves.toEqual({
            ok: true,
        });
        await call('reaction_set', { channelId: 'r1', chatId: 'r1:4', emoji: 'x', on: false });
        expect(backend.reacted.map(entry => entry.on)).toEqual([true, false]);
    });

    it('an id from another room and an empty userIds are bad params and spend no budget', async () => {
        const { call } = setup();
        await expect(call('thread_reply', { channelId: 'r1', parentId: 'r2:5', text: 'x' })).rejects.toMatchObject({
            code: 'bad_params',
        });
        await expect(call('reaction_set', { channelId: 'r1', chatId: 'r2:5', emoji: 'x' })).rejects.toMatchObject({
            code: 'bad_params',
        });
        await expect(call('mention_send', { channelId: 'r1', text: 'x', userIds: [] })).rejects.toMatchObject({
            code: 'bad_params',
        });
        await call('message_send', { channelId: 'r1', text: 'a' });
        await call('message_send', { channelId: 'r1', text: 'b' });
    });

    it('the sent message comes back with its text wrapped as untrusted', async () => {
        const { call } = setup();
        const sent = (await call('message_send', { channelId: 'r1', text: 'hi' })) as { content: string };
        expect(sent.content).toBe('<untrusted-message-content>\n[AI] hi\n</untrusted-message-content>');
    });
});
