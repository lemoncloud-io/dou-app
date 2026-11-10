import {
    createMentionRelay,
    highestPersistedChatNo,
    isPublicRelayRoom,
    mentionEventOf,
    relayMembershipOf,
    viewerIdsOf,
    type RelayChat,
    type RelayPorts,
    type RelayMembership,
    type RelaySnapshot,
} from './relay';
import { createRelayTransport } from './transport';

const scope = {
    cloudId: 'cloud-a',
    channelId: 'ch-public',
    channelName: 'public',
    viewerIds: ['cloud-me'],
};
const row = (chatNo: number, extra: Partial<RelayChat> = {}): RelayChat => ({
    id: `ch-public:${chatNo}`,
    cid: 'cloud-a',
    channelId: 'ch-public',
    chatNo,
    ownerId: 'other',
    content: '@Me hello',
    mention$: { userIds: ['cloud-me'] },
    createdAtMs: 123,
    ...extra,
});
const snapshot = (extra: Partial<RelaySnapshot> = {}): RelaySnapshot => ({
    ...scope,
    roomUserId: 'cloud-me',
    membership: { joinedNo: 0 },
    ready: true,
    rows: [row(10)],
    ...extra,
});
const setup = (overrides: Partial<RelayPorts> = {}) => {
    let receive: ((rows: readonly RelayChat[]) => void) | undefined;
    const off = jest.fn();
    const offMembership = jest.fn();
    let updateMembership: ((value: RelayMembership | null) => void) | undefined;
    const ports = {
        config: jest.fn(async () => ({
            enabled: true,
            channelName: 'public',
            includeSelf: true,
            token: 'local-nonce',
        })),
        register: jest.fn(async () => ({ accepted: true, baselineChatNo: 10 })),
        event: jest.fn(async () => ({ accepted: true })),
        observe: jest.fn((_scope, callback) => {
            receive = callback;
            return off;
        }),
        observeMembership: jest.fn((_scope, _viewer, receive: (membership: RelayMembership | null) => void) => {
            updateMembership = receive;
            receive({ joinedNo: 0 });
            return offMembership;
        }),
        isCurrentUser: jest.fn(() => true),
        status: jest.fn(),
        armed: jest.fn(),
        ...overrides,
    };
    const relay = createMentionRelay(ports);
    return {
        ports,
        relay,
        off,
        offMembership,
        emit: (rows: readonly RelayChat[]) => receive?.(rows),
        emitMembership: (value: RelayMembership | null) => updateMembership?.(value),
    };
};

describe('persisted mention records', () => {
    it('uses the actual room viewer id and includes the sender when configured', () => {
        expect(mentionEventOf(row(11, { ownerId: 'cloud-me' }), scope, true)).toMatchObject({
            messageId: 'ch-public:11',
            senderId: 'cloud-me',
            mentionUserIds: ['cloud-me'],
            createdAt: 123,
        });
        expect(mentionEventOf(row(11, { mention$: { userIds: ['cloud-me'], all: 1 } }), scope, true)).toMatchObject({
            mentionAll: true,
        });
        expect(mentionEventOf(row(11, { ownerId: 'cloud-me' }), scope, false)).toBeNull();
    });

    it.each([
        { mention$: undefined },
        { mention$: { all: true } },
        { mention$: { all: 1 } },
        { mention$: { userIds: ['stranger'] } },
        { mention$: { userIds: 'cloud-me' } },
        { mention$: { userIds: ['cloud-me', 1] } },
        { mention$: { userIds: ['cloud-me-other'] } },
        { isPending: true },
        { isFailed: true },
        { chatNo: 0 },
        { chatNo: -1 },
        { chatNo: 1.5 },
        { id: '' },
        { ownerId: '' },
        { cid: 'cloud-b' },
        { channelId: 'private' },
        { hidden: true },
        { stereo: 'system' },
        { stereo: 'reaction' },
        { content: {} },
    ])('rejects a non-direct or unpersisted record: %j', extra => {
        expect(mentionEventOf(row(11, extra), scope, true)).toBeNull();
    });

    it('takes the baseline only from positive persisted rows in the armed scope', () => {
        expect(
            highestPersistedChatNo([row(10), row(99, { isPending: true }), row(100, { cid: 'other' }), row(0)], scope)
        ).toBe(10);
        expect(highestPersistedChatNo([], scope)).toBe(0);
        expect(viewerIdsOf(['b', null, 'a', '', 'b', undefined])).toEqual(['a', 'b']);
    });
});

describe('local mention relay lifetime', () => {
    it('does no setup for a private, unready or empty room', async () => {
        const { relay, ports } = setup();
        await relay.offer(snapshot({ channelName: 'private' }));
        await relay.offer(snapshot({ ready: false }));
        await relay.offer(snapshot({ rows: [] }));
        await relay.offer(snapshot({ roomUserId: '' }));
        expect(ports.config).not.toHaveBeenCalled();
    });

    it('registers once, skips the initial baseline, and delivers one self-sent mention', async () => {
        const { relay, ports, emit } = setup();
        await Promise.all([relay.offer(snapshot()), relay.offer(snapshot())]);
        await relay.offer(snapshot({ channelId: 'other' }));
        emit([row(9), row(10), row(11, { ownerId: 'cloud-me' })]);
        emit([row(11, { content: 'edited' })]);
        await relay.settled();
        expect(ports.config).toHaveBeenCalledTimes(1);
        expect(ports.register).toHaveBeenCalledWith('local-nonce', scope, 10);
        expect(ports.observe).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenCalledWith(scope);
        expect(ports.event).toHaveBeenCalledTimes(1);
        expect(ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ messageId: 'ch-public:11', senderId: 'cloud-me' }),
            expect.any(Function)
        );
    });

    it('does not turn an edit of a previously observed plain message into a new mention', async () => {
        const { relay, ports, emit } = setup();
        await relay.offer(snapshot());
        emit([row(11, { mention$: undefined }), row(12, { isPending: true })]);
        emit([row(11), row(12)]);
        await relay.settled();
        expect(ports.event).toHaveBeenCalledTimes(1);
        expect(ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ messageId: 'ch-public:12' }),
            expect.any(Function)
        );
    });

    it('uses the server baseline after reload and after a concurrent registration', async () => {
        const first = setup({
            config: async () => ({
                enabled: true,
                channelName: 'public',
                includeSelf: true,
                token: 'nonce',
                scope,
                baselineChatNo: 8,
            }),
            register: jest.fn(async () => ({ accepted: true, baselineChatNo: 8 })),
        });
        await first.relay.offer(snapshot());
        await first.relay.settled();
        expect(first.ports.register).toHaveBeenCalledWith('nonce', scope, 8);
        expect(first.ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ chatNo: 10 }),
            expect.any(Function)
        );
        const concurrent = setup({ register: async () => ({ accepted: true, baselineChatNo: 9 }) });
        await concurrent.relay.offer(snapshot());
        await concurrent.relay.settled();
        expect(concurrent.ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ chatNo: 10 }),
            expect.any(Function)
        );
    });

    it('stops on a persisted scope mismatch or a registration refusal', async () => {
        for (const override of [
            {
                config: async () => ({
                    enabled: true,
                    channelName: 'public',
                    token: 'nonce',
                    scope: { ...scope, cloudId: 'other' },
                }),
            },
            { register: async () => ({ accepted: false, reason: 'scope-mismatch' }) },
            { register: async () => ({ accepted: true }) },
        ]) {
            const { relay, ports } = setup(override);
            await relay.offer(snapshot());
            await relay.offer(snapshot());
            expect(ports.observe).not.toHaveBeenCalled();
            expect(ports.event).not.toHaveBeenCalled();
        }
    });

    it('disabled config and setup failures never become render-driven retries', async () => {
        for (const config of [
            async () => ({ enabled: false }),
            async () => {
                throw new Error('offline');
            },
        ]) {
            const { relay, ports } = setup({ config: jest.fn(config) });
            await relay.offer(snapshot());
            await relay.offer(snapshot());
            expect(ports.config).toHaveBeenCalledTimes(1);
            expect(ports.observe).not.toHaveBeenCalled();
        }
    });

    it('releases the persistent observer on stop and ignores later emissions', async () => {
        const { relay, ports, emit, off } = setup();
        await relay.offer(snapshot());
        relay.stop();
        emit([row(11)]);
        await relay.settled();
        expect(off).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenLastCalledWith(null);
        expect(ports.event).not.toHaveBeenCalled();
    });

    it('stops on an account change, including while setup is in flight', async () => {
        const current = jest.fn(() => true);
        const { relay, ports, emit, off } = setup({ isCurrentUser: current });
        await relay.offer(snapshot());
        current.mockReturnValue(false);
        emit([row(11)]);
        expect(off).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenLastCalledWith(null);
        expect(ports.event).not.toHaveBeenCalled();
        const second = setup({ isCurrentUser: () => false });
        await second.relay.offer(snapshot());
        expect(second.ports.register).not.toHaveBeenCalled();
    });

    it('does not requeue failed events or edits on each emission', async () => {
        const { relay, ports, emit } = setup({
            event: jest.fn(async () => {
                throw new Error('failed');
            }),
        });
        await relay.offer(snapshot());
        emit([row(11)]);
        await relay.settled();
        emit([row(11)]);
        await relay.settled();
        expect(ports.event).toHaveBeenCalledTimes(1);
        expect(ports.status).toHaveBeenCalledWith(expect.stringContaining('bounded retries'));
    });
});

describe('relay receipt and self-mention policy', () => {
    it('exposes no self-mention candidate when includeSelf is false', async () => {
        const { relay, ports } = setup({
            config: async () => ({ enabled: true, channelName: 'public', includeSelf: false, token: 'nonce' }),
        });
        await relay.offer(snapshot());
        expect(ports.armed).not.toHaveBeenCalled();
    });
    it('reports queue uncertainty without claiming delivery', async () => {
        const { relay, ports, emit } = setup({ event: async () => ({ accepted: true, status: 'queue-uncertain' }) });
        await relay.offer(snapshot());
        emit([row(11)]);
        await relay.settled();
        expect(ports.status).toHaveBeenCalledWith('Mention queue receipt uncertain; check the destination.');
        expect(ports.status).not.toHaveBeenCalledWith(expect.stringMatching(/delivered/i));
    });
    it('stops the observer when the local relay is disabled during a send', async () => {
        const { relay, ports, emit, off } = setup({ event: async () => ({ accepted: false, reason: 'disabled' }) });
        await relay.offer(snapshot());
        emit([row(11), row(12)]);
        await relay.settled();
        expect(off).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenLastCalledWith(null);
    });
});

describe('public relay room identity', () => {
    it('requires a resolved group room with the actual public name', () => {
        expect(isPublicRelayRoom({ id: 'room', name: 'public' }, true, 'room')).toBe(true);
        expect(isPublicRelayRoom({ id: 'room', name: 'public' }, false, 'room')).toBe(false);
        expect(isPublicRelayRoom({ id: 'room', name: 'dm-name' }, false, 'room')).toBe(false);
        expect(isPublicRelayRoom({ id: 'room', name: 'private-name' }, true, 'room')).toBe(false);
        expect(isPublicRelayRoom({ id: 'old-room', name: 'public' }, true, 'room')).toBe(false);
        expect(isPublicRelayRoom(null, true, 'room')).toBe(false);
    });
});

describe('room identity during a cloud switch', () => {
    it('refuses a snapshot that mixes the old committed uid with the room-cloud uid', async () => {
        const { relay, ports } = setup();
        await relay.offer(snapshot({ viewerIds: ['cloud-me', 'previous-cloud-me'] }));
        expect(ports.config).not.toHaveBeenCalled();
        await relay.offer(snapshot({ viewerIds: ['cloud-me'] }));
        expect(ports.register).toHaveBeenCalledWith('local-nonce', scope, 10);
    });
});

describe('immutable thread parent context', () => {
    it.each([undefined, null, ''])('emits explicit null for a channel row with parentId %j', parentId => {
        expect(mentionEventOf(row(11, { parentId }), scope, true)).toMatchObject({ parentId: null });
    });

    it.each(['7', 'ch-public:7'])('preserves the stored parent encoding %s', parentId => {
        expect(mentionEventOf(row(11, { parentId }), scope, true)).toMatchObject({ parentId });
    });

    it.each([
        'other-channel:7',
        'ch-public:0',
        '0',
        '-1',
        '11',
        '12',
        '07',
        '7.0',
        '7e0',
        ' 7',
        '7 ',
        ' ',
        'ch-public:7:8',
        '9007199254740992',
        7,
        false,
        {},
        [],
    ])('rejects invalid parent metadata without falling back to the channel: %j', parentId => {
        expect(mentionEventOf(row(11, { parentId }), scope, true)).toBeNull();
    });

    it('keeps each message parent across snapshots and never derives it from content', async () => {
        const { relay, ports, emit } = setup();
        await relay.offer(snapshot());
        emit([
            row(11, { parentId: '7' }),
            row(12, { parentId: 'ch-public:8' }),
            row(13, { content: '@Me reply in thread 7' }),
        ]);
        await relay.settled();
        expect(ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ messageId: 'ch-public:11', parentId: '7' }),
            expect.any(Function)
        );
        expect(ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ messageId: 'ch-public:12', parentId: 'ch-public:8' }),
            expect.any(Function)
        );
        expect(ports.event).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ messageId: 'ch-public:13', parentId: null }),
            expect.any(Function)
        );
    });
});

describe('current membership boundary', () => {
    it('does not relay retained messages from before the current membership after reload', async () => {
        const { relay, ports, emit } = setup({
            config: async () => ({ enabled: true, channelName: 'public', token: 'nonce', baselineChatNo: 100 }),
            register: jest.fn(async () => ({ accepted: true, baselineChatNo: 100 })),
            ...{
                observeMembership: (
                    _scope: unknown,
                    _viewer: string,
                    receive: (value: RelayMembership | null) => void
                ) => {
                    receive({ joinedNo: 200 });
                    return () => undefined;
                },
            },
        });
        await relay.offer(
            snapshot({ rows: [row(201, { mention$: undefined })], ...{ membership: { joinedNo: 200 } } })
        );
        emit([row(150), row(202)]);
        await relay.settled();
        expect(ports.register).toHaveBeenCalledWith('nonce', scope, 100);
        expect(ports.event.mock.calls.map((call: unknown[]) => (call[1] as { chatNo: number }).chatNo)).toEqual([202]);
    });
});

describe('resolved own membership', () => {
    const ownJoin = { cid: 'cloud-a', channelId: 'ch-public', userId: 'cloud-me', joined: 1, joinedNo: 200 };
    it('uses only the exact cloud, channel and viewer membership', () => {
        expect(relayMembershipOf([ownJoin], scope, 'cloud-me')).toEqual({ joinedNo: 200 });
        expect(relayMembershipOf([{ ...ownJoin, joinedNo: 0 }], scope, 'cloud-me')).toEqual({ joinedNo: 0 });
    });
    it.each([
        null,
        undefined,
        [],
        [{ ...ownJoin, cid: 'other' }],
        [{ ...ownJoin, channelId: 'other' }],
        [{ ...ownJoin, userId: 'other' }],
        [{ ...ownJoin, joined: 0 }],
        [{ ...ownJoin, joined: undefined }],
        [{ ...ownJoin, joinedNo: undefined }],
        [{ ...ownJoin, joinedNo: -1 }],
        [{ ...ownJoin, joinedNo: 0.5 }],
    ])('does not authorize an unresolved, inactive or invalid join: %j', joins => {
        expect(relayMembershipOf(joins, scope, 'cloud-me')).toBeNull();
    });
});

describe('membership changes during observation and delivery', () => {
    it('does not contact the relay until the page has a resolved active membership', async () => {
        const { relay, ports } = setup();
        await relay.offer(snapshot({ membership: null }));
        expect(ports.config).not.toHaveBeenCalled();
        await relay.offer(snapshot());
        expect(ports.register).toHaveBeenCalledTimes(1);
    });
    it('waits for its retained join observer before exporting cached rows or offering self', async () => {
        let resolveJoin: ((value: RelayMembership | null) => void) | undefined;
        const { relay, ports, emit } = setup({
            observeMembership: (_scope, _viewer, callback) => {
                resolveJoin = callback;
                return () => undefined;
            },
        });
        await relay.offer(snapshot());
        emit([row(11)]);
        await relay.settled();
        expect(ports.event).not.toHaveBeenCalled();
        expect(ports.armed).not.toHaveBeenCalled();
        resolveJoin?.({ joinedNo: 0 });
        await relay.settled();
        expect(ports.event).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenCalledWith(scope);
    });
    it('stops both observers and self mentions when the active membership disappears', async () => {
        const { relay, ports, emit, emitMembership, off, offMembership } = setup();
        await relay.offer(snapshot());
        emit([row(11)]);
        emitMembership(null);
        emit([row(12)]);
        await relay.settled();
        expect(ports.event).not.toHaveBeenCalled();
        expect(off).toHaveBeenCalledTimes(1);
        expect(offMembership).toHaveBeenCalledTimes(1);
        expect(ports.armed).toHaveBeenLastCalledWith(null);
    });
    it('disposes a synchronous unresolved join without starting the chat observer', async () => {
        const dispose = jest.fn();
        const { relay, ports } = setup({
            observeMembership: (_scope, _viewer, receive) => {
                receive(null);
                return dispose;
            },
        });
        await relay.offer(snapshot());
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(ports.observe).not.toHaveBeenCalled();
    });
    it('drops queued rows behind an advanced join cursor while allowing newer rows', async () => {
        const { relay, ports, emit, emitMembership } = setup();
        await relay.offer(snapshot());
        emit([row(150), row(202)]);
        emitMembership({ joinedNo: 200 });
        emitMembership({ joinedNo: 100 });
        await relay.settled();
        expect(ports.event.mock.calls.map((call: unknown[]) => (call[1] as { chatNo: number }).chatNo)).toEqual([202]);
    });
    it.each([{ joinedNo: 200 }, null])(
        'does not retry a transport failure after membership changes to %j',
        async nextMembership => {
            const request = jest.fn(async () => ({ status: 503, ok: false }) as Response);
            let advance: () => void = () => undefined;
            const transport = createRelayTransport(request, async () => {
                advance();
            });
            const { relay, ports, emit, emitMembership } = setup({ event: transport.event });
            advance = () => emitMembership(nextMembership);
            await relay.offer(snapshot());
            emit([row(150)]);
            await relay.settled();
            expect(request).toHaveBeenCalledTimes(1);
            expect(ports.status).not.toHaveBeenCalledWith(expect.stringContaining('bounded retries'));
        }
    );
});

it('does not let later page snapshots replace a more recent membership observation', async () => {
    const { relay, ports, emit, emitMembership } = setup();
    await relay.offer(snapshot());
    emitMembership({ joinedNo: 200 });
    await relay.offer(snapshot({ membership: { joinedNo: 0 }, rows: [row(150)] }));
    emit([row(150), row(202)]);
    await relay.settled();
    expect(ports.register).toHaveBeenCalledTimes(1);
    expect(ports.event.mock.calls.map((call: unknown[]) => (call[1] as { chatNo: number }).chatNo)).toEqual([202]);
});
