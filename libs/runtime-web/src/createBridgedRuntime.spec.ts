import type { IWebBridgeClient } from '@chatic/bridges';

import { RUNTIME_CALL_TIMEOUT_MS, createBridgedRuntime, webMirrorPort } from './createBridgedRuntime';

const fakeClient = () => {
    const handlers = new Map<string, (message: { data: unknown }) => void>();
    const request = jest.fn(async (message: { type: string; data: Record<string, unknown> }) => {
        if (message.type === 'RuntimeCall') return { type: 'OnRuntimeCall', success: true, data: { value: 'ok' } };
        return { type: `On${message.type}`, success: true, data: {} };
    });
    const client = {
        request,
        onEvent: jest.fn((type: string, handler: (message: { data: unknown }) => void) => {
            handlers.set(type, handler);
            return () => handlers.delete(type);
        }),
    };
    const push = (type: string, data: unknown) => handlers.get(type)?.({ data });
    return { client: client as unknown as IWebBridgeClient, request, push };
};

describe('webMirrorPort', () => {
    it("sends a call over the bridge with the runtime's own timeout, and answers its body", async () => {
        const { client, request } = fakeClient();
        const port = webMirrorPort(client);

        await expect(port.call({ target: 'sync', method: 'listTargets', args: [] })).resolves.toEqual({ value: 'ok' });
        expect(request).toHaveBeenCalledWith(
            { type: 'RuntimeCall', data: { target: 'sync', method: 'listTargets', args: [] } },
            { timeoutMs: RUNTIME_CALL_TIMEOUT_MS }
        );
    });

    it('hears the runtime pushes by their message type', () => {
        const { client, push } = fakeClient();
        const port = webMirrorPort(client);
        const events: unknown[] = [];
        const sessions: unknown[] = [];
        port.onEvent(payload => events.push(payload));
        port.onSessionChanged(payload => sessions.push(payload));

        push('OnRuntimeEvent', { subscriptionId: 'm1', seq: 1, event: [1] });
        push('OnRuntimeSessionChanged', { seq: 2, signals: ['session'], session: {} });

        expect(events).toEqual([{ subscriptionId: 'm1', seq: 1, event: [1] }]);
        expect(sessions).toEqual([{ seq: 2, signals: ['session'], session: {} }]);
    });

    it('keeps the newest session push heard before anyone listened, with every signal since', () => {
        const { client, push } = fakeClient();
        const port = webMirrorPort(client);

        push('OnRuntimeSessionChanged', { seq: 1, signals: ['logout', 'session'], session: { n: 1 } });
        push('OnRuntimeSessionChanged', { seq: 2, signals: ['session'], session: { n: 2 } });
        const sessions: unknown[] = [];
        port.onSessionChanged(payload => sessions.push(payload));
        port.onSessionChanged(payload => sessions.push(payload));

        expect(sessions).toEqual([{ seq: 2, signals: ['logout', 'session'], session: { n: 2 } }]);
    });

    it('subscribes with the runtime timeout, so the page does not give up on a stream the shell keeps', async () => {
        const { client, request } = fakeClient();
        await webMirrorPort(client).subscribe({ subscriptionId: 'm1', target: 'sync', topic: 'x', args: [] });
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: 'RuntimeSubscribe' }), {
            timeoutMs: RUNTIME_CALL_TIMEOUT_MS,
        });
    });
});

describe('createBridgedRuntime', () => {
    it('builds an engine that reads the hello session and opens its views over the bridge', async () => {
        const { client, request } = fakeClient();
        const engine = createBridgedRuntime({
            hello: { seq: 3, session: { auth: { isInitialized: true } } },
            port: webMirrorPort(client),
        });

        expect(engine.session.snapshot()).toEqual({ auth: { isInitialized: true } });
        expect(request.mock.calls.map(([message]) => [message.type, message.data.target, message.data.topic])).toEqual([
            ['RuntimeSubscribe', 'connection', 'snapshot'],
            ['RuntimeSubscribe', 'sync', 'refusedChannels'],
        ]);
        engine.dispose();
    });
});
