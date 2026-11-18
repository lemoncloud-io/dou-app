import { connect, type ChaticApps } from './chaticApps';
import { ChaticAppsError } from './errors';
import { installChaticAppsMock, type MockController, type MockOptions } from './mock';
import { createBridgeClient } from './client';
import { LISTENER, browserRuntime, runtimeOver } from './runtime';
import type { RuntimeChannel, RuntimeList, RuntimeSession } from './runtimeTypes';
import type { Transport } from './transport';

/** Lets the mock's asynchronous replies and pushes land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

const rooms: RuntimeChannel[] = [{ id: 'ch1', cid: 'c1', sid: 's1', isNotificationEnabled: true, name: 'General' }];
const listOf = (list: RuntimeChannel[]): RuntimeList<RuntimeChannel> => ({ list, meta: { total: list.length } });

describe('apps.runtime, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('is offered only to a page with a runtime permission', async () => {
        const { apps } = await start({ permissions: ['share'] });

        expect(apps.supports('runtime')).toBe(false);
        await expect(apps.runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'NOT_SUPPORTED' }));
    });

    it('connects, and reports what the page may use', async () => {
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { calls: { 'channel.cacheReadList': () => listOf(rooms) }, streams: {} },
        });

        expect(apps.supports('runtime')).toBe(true);
        expect(apps.runtime.can('channel.cacheReadList')).toBe(false);
        await expect(apps.runtime.connect()).resolves.toEqual({
            contract: 1,
            allowed: { calls: ['channel.cacheReadList'], streams: [] },
        });
        expect(apps.runtime.can('channel.cacheReadList')).toBe(true);
        expect(apps.runtime.can('chat.getChat')).toBe(false);
    });

    it('calls a read method and resolves with what it returned', async () => {
        const read = jest.fn((query: unknown) => ({ ...listOf(rooms), query }));
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { calls: { 'channel.cacheReadList': read } },
        });

        await expect(apps.runtime.call('channel.cacheReadList', { sid: 's1' })).resolves.toEqual({
            ...listOf(rooms),
            query: { sid: 's1' },
        });
        expect(read).toHaveBeenCalledWith({ sid: 's1' });
    });

    it('refuses a method outside what the app allowed, without asking it', async () => {
        const { apps } = await start({ permissions: ['channel'], runtime: { calls: {} } });

        await expect(apps.runtime.call('chat.sendChat', { channelId: 'r1', content: 'hi' })).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
    });

    it("rejects with the user's refusal, and asks again on the next connect", async () => {
        const { apps } = await start({ permissions: ['channel'], runtime: { consent: 'refuse' } });

        await expect(apps.runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'CONSENT_REFUSED' }));
        await expect(apps.runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'CONSENT_REFUSED' }));
    });

    it('hands each event to the listener, with the listener marker added where the page left none', async () => {
        let emit: (...event: unknown[]) => void = () => undefined;
        const open = jest.fn((send: (result: RuntimeList<RuntimeChannel> | null) => void) => {
            emit = send as (...event: unknown[]) => void;
            return () => undefined;
        });
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { streams: { 'channel.observeList': open } },
        });
        const listener = jest.fn();

        await apps.runtime.subscribe('channel.observeList', [{ sid: 's1' }], listener);
        emit(listOf(rooms));
        await settle();

        expect(open).toHaveBeenCalledWith(expect.any(Function), { sid: 's1' });
        expect(listener).toHaveBeenCalledWith(listOf(rooms));
    });

    it('keeps a listener marker the page placed itself', async () => {
        const open = jest.fn(() => () => undefined);
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { streams: { 'channel.observeItem': open } },
        });

        await apps.runtime.subscribe('channel.observeItem', ['ch1', LISTENER], jest.fn());

        expect(open).toHaveBeenCalledWith(expect.any(Function), 'ch1');
    });

    it('stops a stream: no event reaches the listener after', async () => {
        let emit: (...event: unknown[]) => void = () => undefined;
        const stop = jest.fn();
        const { apps } = await start({
            permissions: ['channel'],
            runtime: {
                streams: {
                    'channel.observeList': send => {
                        emit = send as (...event: unknown[]) => void;
                        return stop;
                    },
                },
            },
        });
        const listener = jest.fn();

        const stream = await apps.runtime.subscribe('channel.observeList', [{}], listener);
        await stream.stop();
        emit({ list: [] });
        await settle();

        expect(stop).toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });

    it('ends streams and tells the page once when the cloud changes', async () => {
        const { apps, mock } = await start({
            permissions: ['channel'],
            runtime: {
                calls: { 'channel.fetchList': () => listOf([]) },
                streams: { 'channel.observeList': () => undefined },
            },
        });
        const onEnd = jest.fn();
        const onCloudChanged = jest.fn();
        apps.runtime.onCloudChanged(onCloudChanged);
        await apps.runtime.subscribe('channel.observeList', [{}], jest.fn(), onEnd);

        mock.changeCloud();
        await settle();

        expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLOUD_CHANGED' }));
        expect(onEnd.mock.calls[0][0]).toBeInstanceOf(ChaticAppsError);
        await expect(apps.runtime.call('channel.fetchList', {})).rejects.toEqual(
            expect.objectContaining({ code: 'CLOUD_CHANGED' })
        );
        expect(onCloudChanged).toHaveBeenCalledTimes(1);
    });

    it('gives the session only with the `session` permission', async () => {
        const session: RuntimeSession = {
            context: {
                cloud: { cloudId: 'c1', siteId: 's1', isActive: true },
                identity: { userId: 'u1', isAuthenticated: true },
            },
            committedSiteId: 's1',
        };

        const without = await start({ permissions: ['channel'], runtime: { session } });
        await without.apps.runtime.connect();
        expect(without.apps.runtime.session()).toBeNull();
        without.apps.disconnect();
        without.mock.uninstall();

        const withIt = await start({ permissions: ['session'], runtime: { session } });
        await withIt.apps.runtime.connect();
        expect(withIt.apps.runtime.session()).toEqual(session);
    });
});

describe('apps.runtime.sendMessage, against the mock app', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    const start = async (options: MockOptions = {}) => {
        mock = installChaticAppsMock({ log: false, ...options });
        apps = await connect({ reportErrors: false });
        return { mock, apps };
    };

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
        apps = undefined;
        mock = undefined;
    });

    it('sends through chat.sendChat, and the mock records it', async () => {
        const { apps, mock } = await start({ permissions: ['chatSend'] });

        const sent = await apps.runtime.sendMessage('ch1', 'hello');

        expect(sent).toEqual(expect.objectContaining({ channelId: 'ch1', content: 'hello', chatNo: 1 }));
        expect(mock.sentMessages).toEqual([{ channelId: 'ch1', text: 'hello' }]);
        expect(apps.runtime.can('chat.sendChat')).toBe(true);
    });

    it("answers with the page's own mock answer when it gives one, and still records", async () => {
        const answer = jest.fn((input: { channelId: string; content: string }) => ({
            id: 'm1',
            cid: 'c1',
            channelId: input.channelId,
            chatNo: 7,
            isPending: false,
            isFailed: false,
            createdAtMs: 1,
            updatedAtMs: 1,
            content: input.content,
        }));
        const { apps, mock } = await start({
            permissions: ['chatSend'],
            runtime: { calls: { 'chat.sendChat': answer } },
        });

        await expect(apps.runtime.call('chat.sendChat', { channelId: 'ch1', content: 'hi' })).resolves.toEqual(
            expect.objectContaining({ id: 'm1', chatNo: 7 })
        );
        expect(answer).toHaveBeenCalledWith({ channelId: 'ch1', content: 'hi' });
        expect(mock.sentMessages).toEqual([{ channelId: 'ch1', text: 'hi' }]);
    });

    it('refuses a send without the chatSend permission, even with an answer given', async () => {
        const { apps, mock } = await start({
            permissions: ['chat'],
            runtime: { calls: { 'chat.sendChat': () => Promise.reject(new Error('never asked')) } },
        });

        await expect(apps.runtime.sendMessage('ch1', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'RUNTIME_NOT_ALLOWED' })
        );
        expect(mock.sentMessages).toEqual([]);
    });

    it('numbers sends in flight together apart', async () => {
        const { apps } = await start({ permissions: ['chatSend'] });

        const [one, two] = await Promise.all([
            apps.runtime.sendMessage('ch1', 'one'),
            apps.runtime.sendMessage('ch1', 'two'),
        ]);

        expect(one.id).not.toBe(two.id);
        expect([one.chatNo, two.chatNo]).toEqual([1, 2]);
    });

    it('records nothing for a send its answer failed', async () => {
        const { apps, mock } = await start({
            permissions: ['chatSend'],
            runtime: { calls: { 'chat.sendChat': () => Promise.reject(new Error('the server said no')) } },
        });

        await expect(apps.runtime.sendMessage('ch1', 'x')).rejects.toBeInstanceOf(ChaticAppsError);
        expect(mock.sentMessages).toEqual([]);
    });

    it.each([
        ['blank text', 'ch1', '   '],
        ['text over 1000 characters', 'ch1', 'x'.repeat(1001)],
        ['a room id over 200 characters', 'r'.repeat(201), 'hello'],
    ])('refuses %s as the app does, and records nothing', async (_, room, text) => {
        const { apps, mock } = await start({ permissions: ['chatSend'] });

        await expect(apps.runtime.sendMessage(room, text)).rejects.toEqual(
            expect.objectContaining({
                code: 'RUNTIME_NOT_ALLOWED',
                details: expect.objectContaining({ reason: 'guard' }),
            })
        );
        expect(mock.sentMessages).toEqual([]);
    });
});

describe('apps.runtime, called untyped as before the types', () => {
    let mock: MockController | undefined;
    let apps: ChaticApps | undefined;

    afterEach(() => {
        apps?.disconnect();
        mock?.uninstall();
    });

    it('answers a known method through an explicit type, a method name in a variable, and an unknown name', async () => {
        mock = installChaticAppsMock({
            log: false,
            permissions: ['channel'],
            runtime: {
                calls: {
                    'channel.cacheReadList': () => listOf(rooms),
                    'channel.fromANewerApp': (...args: unknown[]) => ({ echoed: args }),
                },
            },
        });
        apps = await connect({ reportErrors: false });

        // The untyped spelling, typed by the caller.
        await expect(apps.runtime.call<{ list: unknown[] }>('channel.cacheReadList', { sid: 's1' })).resolves.toEqual(
            listOf(rooms)
        );
        const method = 'channel.cacheReadList' as string;
        await expect(apps.runtime.call(method, {})).resolves.toEqual(listOf(rooms));
        await expect(apps.runtime.call('channel.fromANewerApp', 1, 'two')).resolves.toEqual({ echoed: [1, 'two'] });
    });

    it('subscribes to an unknown stream with the listener marker where the page put it', async () => {
        const open = jest.fn((emit: (...event: unknown[]) => void, first: unknown) => {
            emit('event', first);
        });
        mock = installChaticAppsMock({
            log: false,
            permissions: ['channel'],
            runtime: { streams: { 'channel.observeSomethingNew': open } },
        });
        apps = await connect({ reportErrors: false });
        const listener = jest.fn();

        await apps.runtime.subscribe('channel.observeSomethingNew', ['a', LISTENER, 'b'], listener);
        await settle();

        expect(open).toHaveBeenCalledWith(expect.any(Function), 'a', 'b');
        expect(listener).toHaveBeenCalledWith('event', 'a');
    });
});

describe('browserRuntime', () => {
    it('answers NOT_IN_APP and reads nothing', async () => {
        const runtime = browserRuntime();

        await expect(runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        await expect(runtime.call('channel.fetchList', {})).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_IN_APP' })
        );
        expect(runtime.can('channel.fetchList')).toBe(false);
        await expect(runtime.sendMessage('ch1', 'hello')).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_IN_APP' })
        );
        expect(runtime.session()).toBeNull();
    });
});

describe('apps.runtime.connect, against a slow answer', () => {
    afterEach(() => jest.useRealTimers());

    it('waits for the user however long they take, past the default request timeout', async () => {
        jest.useFakeTimers();
        const sent: Array<Record<string, any>> = [];
        let deliver: ((message: string) => void) | undefined;
        const transport: Transport = {
            send: message => sent.push(JSON.parse(message)),
            listen: next => {
                deliver = next;
                return () => (deliver = undefined);
            },
        };
        const runtime = runtimeOver(
            createBridgeClient(transport, 1_000),
            () => true,
            () => undefined
        );

        const connecting = runtime.connect();
        const outcome = jest.fn();
        connecting.then(outcome, outcome);
        // The app is showing the consent question; a request with the default timeout would have failed.
        await jest.advanceTimersByTimeAsync(60_000);
        expect(outcome).not.toHaveBeenCalled();

        const hello = sent.find(message => message.type === 'RuntimeHello')!;
        deliver?.(
            JSON.stringify({
                type: 'OnRuntimeHello',
                success: true,
                refId: hello.refId,
                data: {
                    sessionOwner: 'native',
                    contract: 1,
                    seq: 1,
                    session: null,
                    allowed: { calls: [], streams: [] },
                },
            })
        );

        await expect(connecting).resolves.toEqual({ contract: 1, allowed: { calls: [], streams: [] } });
    });
});

describe('apps.runtime.connect, across a back-forward-cache restore', () => {
    it('ends a hello still waiting for the user, and asks afresh on the next connect', async () => {
        const sent: Array<Record<string, any>> = [];
        let deliver: ((message: string) => void) | undefined;
        const transport: Transport = {
            send: message => sent.push(JSON.parse(message)),
            listen: next => {
                deliver = next;
                return () => (deliver = undefined);
            },
        };
        const runtime = runtimeOver(
            createBridgeClient(transport),
            () => true,
            () => undefined
        );

        const waiting = runtime.connect();
        runtime.reset();
        await expect(waiting).rejects.toEqual(expect.objectContaining({ code: 'DISCONNECTED' }));

        const again = runtime.connect();
        const hellos = sent.filter(message => message.type === 'RuntimeHello');
        expect(hellos).toHaveLength(2);
        deliver?.(
            JSON.stringify({
                type: 'OnRuntimeHello',
                success: true,
                refId: hellos[1].refId,
                data: {
                    sessionOwner: 'native',
                    contract: 1,
                    seq: 1,
                    session: null,
                    allowed: { calls: [], streams: [] },
                },
            })
        );
        await expect(again).resolves.toEqual({ contract: 1, allowed: { calls: [], streams: [] } });
    });
});
