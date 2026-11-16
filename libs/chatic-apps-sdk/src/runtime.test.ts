import { connect, type ChaticApps } from './chaticApps';
import { ChaticAppsError } from './errors';
import { installChaticAppsMock, type MockController, type MockOptions } from './mock';
import { createBridgeClient } from './client';
import { LISTENER, browserRuntime, runtimeOver } from './runtime';
import type { Transport } from './transport';

/** Lets the mock's asynchronous replies and pushes land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

const rooms = [{ id: 'ch1', name: 'General' }];

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
            runtime: { calls: { 'channel.cacheReadList': () => ({ list: rooms }) }, streams: {} },
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
        const read = jest.fn((query: unknown) => ({ list: rooms, query }));
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { calls: { 'channel.cacheReadList': read } },
        });

        await expect(apps.runtime.call('channel.cacheReadList', { sid: 's1' })).resolves.toEqual({
            list: rooms,
            query: { sid: 's1' },
        });
        expect(read).toHaveBeenCalledWith({ sid: 's1' });
    });

    it('refuses a method outside what the app allowed, without asking it', async () => {
        const { apps } = await start({ permissions: ['channel'], runtime: { calls: {} } });

        await expect(apps.runtime.call('chat.sendChat', {})).rejects.toEqual(
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
        const open = jest.fn((send: (...event: unknown[]) => void) => {
            emit = send;
            return () => undefined;
        });
        const { apps } = await start({
            permissions: ['channel'],
            runtime: { streams: { 'channel.observeList': open } },
        });
        const listener = jest.fn();

        await apps.runtime.subscribe('channel.observeList', [{ sid: 's1' }], listener);
        emit({ list: rooms });
        await settle();

        expect(open).toHaveBeenCalledWith(expect.any(Function), { sid: 's1' });
        expect(listener).toHaveBeenCalledWith({ list: rooms });
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
                        emit = send;
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
                calls: { 'channel.fetchList': () => ({}) },
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
        const session = { context: { cloud: { cloudId: 'c1' } } };

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

describe('browserRuntime', () => {
    it('answers NOT_IN_APP and reads nothing', async () => {
        const runtime = browserRuntime();

        await expect(runtime.connect()).rejects.toEqual(expect.objectContaining({ code: 'NOT_IN_APP' }));
        await expect(runtime.call('channel.fetchList')).rejects.toEqual(
            expect.objectContaining({ code: 'NOT_IN_APP' })
        );
        expect(runtime.can('channel.fetchList')).toBe(false);
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
