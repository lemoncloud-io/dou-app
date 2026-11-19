import type { OnRuntimeEventPayload, OnRuntimeSessionChangedPayload } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';
import { clearActivePerfTrace, createPerfTrace, NOOP_PERF_TRACE_BACKEND, setActivePerfTrace } from '@chatic/perf';
import { slotKeyOf } from '@chatic/transport';

import { coreEngine } from '../../engine';
import type { RuntimeEngine } from '../../engine';
import { createLoopback } from '../../testing/mirrorLoopback';
import { RUNTIME_NOT_AVAILABLE_CODE } from '../errors';
import { createMirrorConversation } from './conversation';
import { createMirrorEngine } from './mirrorEngine';
import type { RuntimeMirrorPort } from './port';

/** A runtime with the members these tests reach, each recording how it was called. */
const fakeRuntime = () => {
    const sessionListeners = new Set<() => void>();
    const logoutListeners = new Set<() => void>();
    const connectionListeners = new Set<() => void>();
    const refusedListeners = new Set<() => void>();
    let session = {
        auth: { isInitialized: true, isAuthenticated: false, error: null },
        relayUser: null as null | { id: string },
        uidByCloud: { c1: 'u-c1' },
    };
    let connectionSnapshot = {
        active: { state: 'open', isConnected: true, isVerified: true, connectionId: 'k1' },
        verifiedSlots: ['default'],
        online: true,
    };
    let refused: string[] = ['ch-gone'];
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const stopped: string[] = [];
    // Each write receipt's delivery, in the order the writes were made: the test settles it as the
    // server would. Handled at once, as the outbox's own promise is, so a refusal no one waits for is
    // not an unhandled rejection.
    const deliveries: { resolve: () => void; reject: (error: unknown) => void }[] = [];
    const writeReceipt = async () => {
        const delivered = new Promise<void>((resolve, reject) => deliveries.push({ resolve, reject }));
        delivered.catch(() => undefined);
        return { delivered };
    };

    const changeSession = (next: Partial<typeof session>) => {
        session = { ...session, ...next };
        sessionListeners.forEach(listener => listener());
    };

    const repositories = {
        chat: {
            observeList: jest.fn((query: unknown, callback: (...args: unknown[]) => void) => {
                listeners.set('chat:list', callback);
                return () => stopped.push('chat:list');
            }),
            refreshList: jest.fn(async (query: { channelId: string }) => ({ list: [query.channelId] })),
            cacheRead: jest.fn(async () => null),
            observeFeedCoverage: jest.fn((channelId: string, callback: (...args: unknown[]) => void) => {
                listeners.set(`coverage:${channelId}`, callback);
                callback([]);
                return () => stopped.push(`coverage:${channelId}`);
            }),
        },
        device: { syncDevice: jest.fn(() => undefined) },
        webhook: { list: jest.fn(async (channelId: string) => [{ id: 'w1', channelId }]) },
        join: {
            updateJoin: jest.fn(async (_payload: unknown) => writeReceipt()),
            readChat: jest.fn(async (_payload: unknown) => writeReceipt()),
        },
    };

    const engine = {
        session: {
            snapshot: () => session,
            subscribe: (listener: () => void) => {
                sessionListeners.add(listener);
                return () => sessionListeners.delete(listener);
            },
            onLogout: (listener: () => void) => {
                logoutListeners.add(listener);
                return () => logoutListeners.delete(listener);
            },
        },
        commands: {
            loginGuestByDevice: jest.fn(async (deviceId: string) => {
                changeSession({ auth: { ...session.auth, isAuthenticated: true }, relayUser: { id: deviceId } });
                return { id: deviceId };
            }),
            switchSite: jest.fn(async () => {
                throw Object.assign(new Error('403 FORBIDDEN - nope'), { errorCode: 403, status: 403 });
            }),
            logout: jest.fn(async () => {
                changeSession({ auth: { ...session.auth, isAuthenticated: false }, relayUser: null });
                logoutListeners.forEach(listener => listener());
            }),
        },
        connection: {
            snapshot: () => connectionSnapshot,
            subscribe: (listener: () => void) => {
                connectionListeners.add(listener);
                return () => connectionListeners.delete(listener);
            },
            waitUntilVerified: jest.fn(async (..._args: unknown[]) => true),
            onServerEvent: jest.fn((type: string, listener: (...args: unknown[]) => void) => {
                listeners.set(`server:${type}`, listener);
                return () => stopped.push(`server:${type}`);
            }),
            setBackgroundClouds: jest.fn(),
        },
        sync: {
            refusedChannels: () => refused,
            subscribeRefusedChannels: (listener: () => void) => {
                refusedListeners.add(listener);
                return () => refusedListeners.delete(listener);
            },
            registerTarget: jest.fn(() => () => stopped.push('target')),
            primeChatRoom: jest.fn(async () => 'ready'),
            fetchRoomFeed: jest.fn(async () => ({ fetchedCount: 0, latestNo: 9 })),
            prefetchRoomFeed: jest.fn(async () => null),
        },
        data: {
            repositories: () => repositories,
            cloudRepositories: jest.fn((cid: string) => ({
                chat: { refreshList: jest.fn(async (query: { channelId: string }) => ({ cid, query })) },
                join: { readChat: jest.fn(async (_payload: unknown) => writeReceipt()) },
            })),
            clearLocalCaches: jest.fn(async () => ({ cleared: 2 })),
            holdCloud: jest.fn((cid: string) => () => stopped.push(`hold:${cid}`)),
        },
    };

    return {
        engine: engine as unknown as RuntimeEngine,
        raw: engine,
        listeners,
        stopped,
        deliveries,
        changeSession,
        changeConnection: (next: Partial<typeof connectionSnapshot>) => {
            connectionSnapshot = { ...connectionSnapshot, ...next };
            connectionListeners.forEach(listener => listener());
        },
        changeRefused: (next: string[]) => {
            refused = next;
            refusedListeners.forEach(listener => listener());
        },
    };
};

const setup = async (options: Parameters<typeof createLoopback>[1] = {}) => {
    const fake = fakeRuntime();
    const loopback = createLoopback(fake.engine, options);
    const hello = await loopback.hello();
    const mirror = createMirrorEngine({ port: loopback.port, hello });
    await loopback.settle();
    return { fake, loopback, mirror };
};

afterEach(() => jest.restoreAllMocks());

describe('createMirrorEngine — every member the in-process engine has', () => {
    it('has the same members, part by part', async () => {
        const { mirror } = await setup();
        const keys = (value: object) => Object.keys(value).sort();
        expect(keys(mirror).filter(key => key !== 'dispose')).toEqual(keys(coreEngine));
        for (const part of ['connection', 'sync', 'data', 'commands'] as const) {
            expect(keys(mirror[part])).toEqual(keys(coreEngine[part]));
        }
        expect(keys(mirror.session)).toEqual(expect.arrayContaining(keys(coreEngine.session)));
    });
});

describe('createMirrorEngine — the session', () => {
    it('reads the hello snapshot, and a command resolves with its change already mirrored', async () => {
        // A shell whose own push would wait past the answer: the answer must not overtake it.
        const { mirror } = await setup({ schedule: run => void setTimeout(run, 0) });
        expect(mirror.session.snapshot().auth.isAuthenticated).toBe(false);
        const seen: boolean[] = [];
        mirror.session.subscribe(() => seen.push(mirror.session.snapshot().auth.isAuthenticated));

        await expect(mirror.commands.loginGuestByDevice('dev-1')).resolves.toEqual({ id: 'dev-1' });

        // No turn passed between the answer and this line: the push came before it.
        expect(mirror.session.snapshot().auth.isAuthenticated).toBe(true);
        expect(mirror.session.snapshot().relayUser).toEqual({ id: 'dev-1' });
        expect(seen).toEqual([true]);
    });

    it('keeps the identity of every part that did not change', async () => {
        const { mirror } = await setup();
        const before = mirror.session.snapshot();
        await mirror.commands.loginGuestByDevice('dev-1');
        const after = mirror.session.snapshot();
        expect(after).not.toBe(before);
        expect(after.uidByCloud).toBe(before.uidByCloud);
        expect(after.auth).not.toBe(before.auth);
    });

    it('runs the sign-out listeners on a logout signal, and a throwing one does not stop the rest', async () => {
        const { mirror } = await setup();
        jest.spyOn(logger, 'error').mockImplementation(() => undefined);
        const heard: string[] = [];
        mirror.session.onLogout(() => {
            throw new Error('boom');
        });
        mirror.session.onLogout(() => heard.push(String(mirror.session.snapshot().relayUser)));
        await mirror.commands.logout();
        expect(heard).toEqual(['null']);
    });

    it('drops a session push numbered at or below the one it holds', () => {
        const pushes = new Set<(payload: OnRuntimeSessionChangedPayload) => void>();
        const port = {
            call: jest.fn(),
            subscribe: jest.fn(async () => ({})),
            unsubscribe: jest.fn(async () => ({})),
            onEvent: () => () => undefined,
            onSessionChanged: (listener: (payload: OnRuntimeSessionChangedPayload) => void) => {
                pushes.add(listener);
                return () => pushes.delete(listener);
            },
        } as unknown as RuntimeMirrorPort;
        const mirror = createMirrorEngine({ port, hello: { seq: 4, session: { auth: { isInitialized: false } } } });
        const push = (seq: number, isInitialized: boolean) =>
            pushes.forEach(listener => listener({ seq, signals: ['session'], session: { auth: { isInitialized } } }));

        push(4, true);
        expect(mirror.session.snapshot().auth.isInitialized).toBe(false);
        push(6, true);
        push(5, false);
        expect(mirror.session.snapshot().auth.isInitialized).toBe(true);
    });

    it('throws the error a screen reads when a command fails', async () => {
        const { mirror } = await setup();
        await expect(mirror.commands.switchSite('s1')).rejects.toMatchObject({
            message: '403 FORBIDDEN - nope',
            errorCode: 403,
            status: 403,
        });
    });
});

describe('createMirrorEngine — views', () => {
    it('mirrors the connection snapshot and the refused rooms, and hears their changes', async () => {
        const { fake, loopback, mirror } = await setup();
        expect(mirror.connection.snapshot().verifiedSlots).toEqual(['default']);
        expect(mirror.sync.isChannelRefused('ch-gone')).toBe(true);

        const before = mirror.connection.snapshot();
        const heard: string[] = [];
        mirror.connection.subscribe(() => heard.push('connection'));
        mirror.sync.subscribeRefusedChannels(() => heard.push('refused'));

        fake.changeConnection({ online: false });
        fake.changeRefused(['ch-gone', 'ch-new']);
        await loopback.settle();

        expect(mirror.connection.snapshot().online).toBe(false);
        expect(mirror.connection.snapshot().active).toBe(before.active);
        expect(mirror.sync.refusedChannels()).toEqual(['ch-gone', 'ch-new']);
        expect(heard).toEqual(['connection', 'refused']);
    });

    it('reads idle and nothing refused before the first values arrive', () => {
        const port = {
            call: jest.fn(),
            subscribe: () => new Promise(() => undefined),
            unsubscribe: jest.fn(async () => ({})),
            onEvent: () => () => undefined,
            onSessionChanged: () => () => undefined,
        } as unknown as RuntimeMirrorPort;
        const mirror = createMirrorEngine({ port, hello: { seq: 0, session: {} } });
        expect(mirror.connection.snapshot()).toMatchObject({ verifiedSlots: [], online: true });
        expect(mirror.sync.isChannelRefused('any')).toBe(false);
    });
});

describe('createMirrorEngine — calls and streams', () => {
    it('drops trailing undefined arguments, so the member sees its own defaults', async () => {
        const { fake, mirror } = await setup();
        await mirror.connection.waitUntilVerified(undefined, undefined);
        expect(fake.raw.connection.waitUntilVerified).toHaveBeenCalledWith();
    });

    it("calls a repository method on the live scope's graph and on a cloud's", async () => {
        const { fake, mirror } = await setup();
        await expect(mirror.data.repositories().chat.refreshList({ channelId: 'ch1' } as never)).resolves.toEqual({
            list: ['ch1'],
        });
        await expect(
            mirror.data.cloudRepositories('c9').chat.refreshList({ channelId: 'ch2' } as never)
        ).resolves.toEqual({ cid: 'c9', query: { channelId: 'ch2' } });
        expect(fake.raw.data.cloudRepositories).toHaveBeenCalledWith('c9');
        expect(mirror.data.cloudRepositories('c9')).toBe(mirror.data.cloudRepositories('c9'));
    });

    it("reaches a channel's webhooks, which the room settings read as soon as an owner opens them", async () => {
        const { fake, mirror } = await setup();

        await expect(mirror.data.repositories().webhook.list('ch1')).resolves.toEqual([
            { id: 'w1', channelId: 'ch1' },
        ]);
        expect(fake.raw.data.repositories().webhook.list).toHaveBeenCalledWith('ch1');
    });

    it('hears an observe stream until it is stopped, then the runtime stops it too', async () => {
        const { fake, loopback, mirror } = await setup();
        const heard: unknown[][] = [];
        const stop = mirror.data
            .repositories()
            .chat.observeList({ channelId: 'ch1' } as never, ((...args: unknown[]) => heard.push(args)) as never);
        await loopback.settle();

        fake.listeners.get('chat:list')?.({ list: [1] }, 'cache');
        await loopback.settle();
        expect(heard).toEqual([[{ list: [1] }, 'cache']]);

        stop();
        await loopback.settle();
        expect(fake.stopped).toContain('chat:list');
        fake.listeners.get('chat:list')?.({ list: [2] });
        await loopback.settle();
        expect(heard).toHaveLength(1);
    });

    it('holds a cloud in the shell until the page lets it go', async () => {
        const { fake, loopback, mirror } = await setup();
        const release = mirror.data.holdCloud('c1');
        await loopback.settle();
        expect(fake.raw.data.holdCloud).toHaveBeenCalledWith('c1');
        expect(fake.stopped).not.toContain('hold:c1');
        release();
        await loopback.settle();
        expect(fake.stopped).toContain('hold:c1');
    });

    it("streams a channel's answered ranges, which a room's history paging reads", async () => {
        const { fake, loopback, mirror } = await setup();
        const heard: unknown[] = [];
        const stop = mirror.data.repositories().chat.observeFeedCoverage('ch1', covered => heard.push(covered));
        await loopback.settle();
        fake.listeners.get('coverage:ch1')?.([[50, 99]]);
        await loopback.settle();
        stop();
        await loopback.settle();

        expect(heard).toEqual([[], [[50, 99]]]);
        expect(fake.stopped).toContain('coverage:ch1');
    });

    it('stops a stream asked to stop before its subscribe was answered, once it is', async () => {
        const { fake, loopback, mirror } = await setup();
        const stop = mirror.sync.registerTarget({ type: 'chat', id: 'ch1' } as never);
        stop();
        await loopback.settle();
        expect(fake.raw.sync.registerTarget).toHaveBeenCalled();
        expect(fake.stopped).toContain('target');
    });

    it('sends a void member without waiting, and logs its failure', async () => {
        const { fake, loopback, mirror } = await setup();
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        mirror.connection.setBackgroundClouds(['c1']);
        mirror.connection.setOwnedClouds(['c1'], []);
        await loopback.settle();
        expect(fake.raw.connection.setBackgroundClouds).toHaveBeenCalledWith(['c1']);
        expect(warn).toHaveBeenCalledWith(
            'WEB_CORE',
            'A mirrored call failed',
            expect.objectContaining({ data: { call: 'connection.setOwnedClouds' } })
        );
    });

    it('refuses the members that do not cross', async () => {
        const { mirror } = await setup();
        await expect(mirror.connection.requestOnSlot('default' as never, 'x')).rejects.toMatchObject({
            code: RUNTIME_NOT_AVAILABLE_CODE,
        });
        expect(() => mirror.connection.onServerMessage(() => undefined)).toThrow(/does not cross/);
    });

    it('sends a repository method that returns nothing without a promise to reject', async () => {
        const { fake, loopback, mirror } = await setup();
        expect(mirror.data.repositories().device.syncDevice('channel' as never, 'ch1')).toBeUndefined();
        await loopback.settle();
        expect(fake.raw.data.repositories().device.syncDevice).toHaveBeenCalledWith('channel', 'ch1');
    });

    it('answers null as null, as the member resolved', async () => {
        const { mirror } = await setup();
        await expect(mirror.data.repositories().chat.cacheRead({ id: 'x' } as never)).resolves.toBeNull();
    });

    it('answers a wait that never rejects in-process with false when the bridge fails', async () => {
        const { fake, mirror } = await setup();
        jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        fake.raw.connection.waitUntilVerified.mockRejectedValueOnce(new Error('gone'));
        await expect(mirror.connection.waitUntilVerified('default' as never)).resolves.toBe(false);
    });

    it('ends every stream it holds when disposed', async () => {
        const { fake, loopback, mirror } = await setup();
        mirror.connection.onServerEvent('chat.sync', () => undefined);
        await loopback.settle();
        mirror.dispose();
        await loopback.settle();
        expect(fake.stopped).toContain('server:chat.sync');
    });
});

describe('createMirrorEngine — write receipts', () => {
    /** Whether `promise` has settled yet, without waiting for it. */
    const settledYet = (promise: Promise<unknown>) => {
        let settled = false;
        promise.then(
            () => (settled = true),
            () => (settled = true)
        );
        return () => settled;
    };

    it('answers once the write is made locally, with a delivered that settles when the server has it', async () => {
        const { fake, loopback, mirror } = await setup();
        const receipt = await mirror.data.repositories().join.updateJoin({ channelId: 'ch1', notify: 'none' } as never);
        expect(fake.raw.data.repositories().join.updateJoin).toHaveBeenCalledWith({ channelId: 'ch1', notify: 'none' });

        // A promise, as in-process: a screen chains `.catch` on it.
        expect(typeof receipt.delivered.catch).toBe('function');
        const delivered = settledYet(receipt.delivered);
        await loopback.settle();
        expect(delivered()).toBe(false);

        fake.deliveries[0].resolve();
        await loopback.settle();
        await expect(receipt.delivered).resolves.toBeUndefined();
    });

    it('rejects delivered with the refusal, carrying the fields a screen reads, and logs nothing itself', async () => {
        const { fake, loopback, mirror } = await setup();
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const receipt = await mirror.data.repositories().join.readChat({ channelId: 'ch1', chatNo: 7 } as never);

        fake.deliveries[0].reject(Object.assign(new Error('403 FORBIDDEN - not a member'), { errorCode: 403 }));
        await loopback.settle();

        await expect(receipt.delivered).rejects.toMatchObject({
            message: '403 FORBIDDEN - not a member',
            errorCode: 403,
        });
        expect(warn).not.toHaveBeenCalled();
    });

    it('rejects the call itself when the write could not be made', async () => {
        const { fake, mirror } = await setup();
        fake.raw.data.repositories().join.updateJoin.mockRejectedValueOnce(new Error('no join row for ch9'));
        await expect(
            mirror.data.repositories().join.updateJoin({ channelId: 'ch9', nick: 'a' } as never)
        ).rejects.toMatchObject({ message: 'no join row for ch9' });
    });

    it("makes the write in the cloud's graph the page named", async () => {
        const { fake, loopback, mirror } = await setup();
        const receipt = await mirror.data
            .cloudRepositories('c9')
            .join.readChat({ channelId: 'ch2', chatNo: 3 } as never);
        expect(fake.raw.data.cloudRepositories).toHaveBeenCalledWith('c9');
        fake.deliveries[0].resolve();
        await loopback.settle();
        await expect(receipt.delivered).resolves.toBeUndefined();
    });

    it('calls the method as before on an app that does not stream receipts, and resolves delivered at once', async () => {
        const { fake, loopback, mirror } = await setup();
        mirror.dispose();
        // An app from before: it has the method as a call only, and refuses the stream.
        const refusedStreams: string[] = [];
        const port: RuntimeMirrorPort = {
            ...loopback.port,
            subscribe: payload => {
                if (!payload.topic.startsWith('join.')) return loopback.port.subscribe(payload);
                refusedStreams.push(payload.topic);
                return Promise.reject({ code: RUNTIME_NOT_AVAILABLE_CODE, message: 'not in this app' });
            },
        };
        const older = createMirrorEngine({ port, hello: await loopback.hello() });
        const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

        const receipt = await older.data.repositories().join.updateJoin({ channelId: 'ch1', nick: 'b' } as never);
        expect(fake.raw.data.repositories().join.updateJoin).toHaveBeenCalledTimes(1);
        await expect(receipt.delivered).resolves.toBeUndefined();

        // The refusal is remembered: each later write is one call, and the missing delivery is logged once.
        const next = await older.data.repositories().join.updateJoin({ channelId: 'ch1', nick: 'c' } as never);
        await older.data.repositories().join.updateJoin({ channelId: 'ch2', nick: 'd' } as never);
        expect(fake.raw.data.repositories().join.updateJoin).toHaveBeenCalledTimes(3);
        await expect(next.delivered).resolves.toBeUndefined();
        expect(refusedStreams).toEqual(['join.updateJoin']);
        expect(info).toHaveBeenCalledTimes(1);
    });

    it('rejects a write the shell never reports made with the 408 a timed-out call reads as', async () => {
        const { fake, loopback } = await setup();
        fake.raw.data.repositories().join.updateJoin.mockImplementationOnce(() => new Promise(() => undefined));
        const talk = createMirrorConversation(loopback.port, { receiptWrittenTimeoutMs: 20 });

        await expect(talk.receipt('data', 'join.updateJoin', [{ channelId: 'ch1' }])).rejects.toMatchObject({
            code: 'TIMEOUT',
            message: expect.stringMatching(/^408 REQUEST TIMEOUT - data\.join\.updateJoin was not written/),
        });
        talk.dispose();
    });

    it('carries JSON, as the bridge does: a promise in a result arrives empty, a date as its string', async () => {
        const { fake, mirror } = await setup();
        fake.raw.data.clearLocalCaches.mockResolvedValueOnce({ at: new Date(0), later: Promise.resolve() } as never);
        await expect(mirror.data.clearLocalCaches()).resolves.toEqual({ at: '1970-01-01T00:00:00.000Z', later: {} });
    });
});

describe('createMirrorEngine — the conversation', () => {
    const scriptedPort = () => {
        const events = new Set<(payload: OnRuntimeEventPayload) => void>();
        let answerSubscribe: () => void = () => undefined;
        const port = {
            call: jest.fn(),
            subscribe: jest.fn(
                (payload: { topic: string }) =>
                    new Promise(resolve => {
                        if (payload.topic === 'onServerEvent') answerSubscribe = () => resolve({});
                        else resolve({});
                    })
            ),
            unsubscribe: jest.fn(async () => ({})),
            onEvent: (listener: (payload: OnRuntimeEventPayload) => void) => {
                events.add(listener);
                return () => events.delete(listener);
            },
            onSessionChanged: () => () => undefined,
        };
        const emit = (payload: OnRuntimeEventPayload) => events.forEach(listener => listener(payload));
        return { port: port as unknown as RuntimeMirrorPort, raw: port, emit, answer: () => answerSubscribe() };
    };

    const serverEventId = (raw: ReturnType<typeof scriptedPort>['raw']) =>
        (raw.subscribe.mock.calls as unknown as [{ subscriptionId: string; topic: string }][]).find(
            ([payload]) => payload.topic === 'onServerEvent'
        )?.[0].subscriptionId as string;

    it('keeps an event that arrives before the subscribe is answered, and drops a late copy', async () => {
        const { port, raw, emit, answer } = scriptedPort();
        const mirror = createMirrorEngine({ port, hello: { seq: 0, session: {} } });
        const heard: unknown[] = [];
        mirror.connection.onServerEvent('chat.sync', message => heard.push(message));
        const id = serverEventId(raw);

        emit({ subscriptionId: id, seq: 1, event: [{ n: 1 }] });
        emit({ subscriptionId: id, seq: 1, event: [{ n: 1 }] });
        answer();
        await Promise.resolve();
        emit({ subscriptionId: id, seq: 2, event: [{ n: 2 }] });
        expect(heard).toEqual([{ n: 1 }, { n: 2 }]);
    });

    it('ends a stream on { $ended }, saying so, and hears nothing after it', () => {
        const { port, raw, emit } = scriptedPort();
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        const mirror = createMirrorEngine({ port, hello: { seq: 0, session: {} } });
        const heard: unknown[] = [];
        mirror.connection.onServerEvent('chat.sync', message => heard.push(message));
        const id = serverEventId(raw);

        emit({ subscriptionId: id, seq: 1, event: { $ended: { code: 'RUNTIME_PAYLOAD_TOO_LARGE', message: 'big' } } });
        emit({ subscriptionId: id, seq: 2, event: [{ n: 2 }] });
        expect(heard).toEqual([]);
        expect(warn).toHaveBeenCalledWith(
            'WEB_CORE',
            'A mirrored stream ended',
            expect.objectContaining({ data: { stream: 'connection.onServerEvent' } })
        );
    });
});

describe('createMirrorEngine — sync calls that keep their in-process promises', () => {
    it('answers a prime cancelled while it ran as cancelled, and a failed one as failed', async () => {
        const { fake, mirror } = await setup();
        jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
        await expect(mirror.sync.primeChatRoom('c1', 'ch1', { cancelled: () => true })).resolves.toBe('cancelled');
        expect(fake.raw.sync.primeChatRoom).toHaveBeenCalledWith('c1', 'ch1');
        fake.raw.sync.primeChatRoom.mockRejectedValueOnce(new Error('gone'));
        await expect(mirror.sync.primeChatRoom('c1', 'ch1')).resolves.toBe('failed');
    });

    it("takes the room's trace for a prefetch only once the cloud's socket is mirrored as verified", async () => {
        const { fake, loopback, mirror } = await setup();
        const roomTrace = () => {
            const trace = createPerfTrace({
                backend: NOOP_PERF_TRACE_BACKEND,
                id: 't',
                name: 'chat_room_sync',
                elapsed: () => 0,
                announce: false,
            });
            setActivePerfTrace('chat_room_sync', 'ch1', trace);
            return trace;
        };
        try {
            const cold = roomTrace();
            await mirror.sync.prefetchRoomFeed('c1', 'ch1');
            expect(cold.hasMetric('feed_sent')).toBe(false);

            fake.changeConnection({ verifiedSlots: ['default', slotKeyOf('c1')] });
            await loopback.settle();
            const warm = roomTrace();
            await mirror.sync.prefetchRoomFeed('c1', 'ch1');
            expect(warm.hasMetric('feed_sent')).toBe(true);
        } finally {
            clearActivePerfTrace('chat_room_sync');
        }
    });

    it('never rejects a prefetch', async () => {
        const { fake, mirror } = await setup();
        fake.raw.sync.prefetchRoomFeed.mockRejectedValueOnce(new Error('gone'));
        await expect(mirror.sync.prefetchRoomFeed('c1', 'ch1')).resolves.toBeNull();
    });
});

describe('createMirrorEngine — lifecycle', () => {
    it('runs nothing itself: the controllers, guards and push registration are inert', async () => {
        const { mirror } = await setup();
        const controller = mirror.sessionController({ deviceId: () => 'd' });
        expect(controller.isReady()).toBe(true);
        await expect(controller.initialize()).resolves.toBeUndefined();
        expect(typeof controller.startGuestKeepAlive()).toBe('function');
        const connection = mirror.connectionController({ deviceId: () => 'd' });
        expect(connection.getSocketPassVersion()).toBe(0);
        await expect(mirror.relayCredentialGuard().check()).resolves.toBeUndefined();
        expect(typeof mirror.pushRegistration({} as never).start()).toBe('function');
    });
});
