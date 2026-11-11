import { createBridgeClient, SDK_BRIDGE_VERSION } from './client';
import { ChaticAppsError } from './errors';
import type { Transport } from './transport';

/** A channel the test plays the app's side of. */
const fakeTransport = () => {
    const sent: Array<Record<string, any>> = [];
    let listener: ((message: string) => void) | undefined;
    const transport: Transport = {
        send: message => sent.push(JSON.parse(message)),
        listen: next => {
            listener = next;
            return () => (listener = undefined);
        },
    };
    const deliver = (message: unknown) => listener?.(typeof message === 'string' ? message : JSON.stringify(message));
    return { transport, sent, deliver };
};

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('createBridgeClient', () => {
    afterEach(() => {
        jest.useRealTimers();
        setVisibility('visible');
    });

    it('sends a request with a fresh refId and the bridge version, and settles with the reply data', async () => {
        const { transport, sent, deliver } = fakeTransport();
        const client = createBridgeClient(transport);

        const pending = client.request('SetSubWebViewTitle', { title: 'Quiz' });
        expect(sent[0]).toEqual(
            expect.objectContaining({
                type: 'SetSubWebViewTitle',
                data: { title: 'Quiz' },
                version: SDK_BRIDGE_VERSION,
            })
        );
        deliver({ type: 'OnSetSubWebViewTitle', success: true, data: { ok: 1 }, refId: sent[0].refId });

        await expect(pending).resolves.toEqual({ ok: 1 });
    });

    // A refusal comes in two shapes; only `success` and `error.code` decide.
    it.each([
        [
            'from a handler',
            { type: 'OnGetSubWebViewUserKey', success: false, error: { code: 'UNAVAILABLE', message: 'm' } },
        ],
        ['from the host', { type: 'ERROR', success: false, error: { code: 'NOT_FOUND', message: 'm', traceId: 't' } }],
    ])('rejects a refusal %s with its code', async (_label, reply) => {
        const { transport, sent, deliver } = fakeTransport();
        const client = createBridgeClient(transport);

        const pending = client.request('X');
        deliver({ ...reply, refId: sent[0].refId });

        await expect(pending).rejects.toEqual(expect.objectContaining({ code: (reply as any).error.code }));
        await expect(pending).rejects.toBeInstanceOf(ChaticAppsError);
    });

    it('routes a message that matches no pending request as a push, by type', () => {
        const { transport, deliver } = fakeTransport();
        const client = createBridgeClient(transport);
        const onBack = jest.fn();
        client.onPush('OnBackPressed', onBack);

        deliver({ type: 'OnBackPressed', success: true, data: {}, refId: 'push-1' });
        // A late reply to a request this client never made is a push nobody listens for.
        deliver({ type: 'OnSetSubWebViewTitle', success: true, data: {}, refId: 'old-load' });

        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it.each(['not json', JSON.stringify([1]), JSON.stringify({ refId: 'x' })])('ignores %s', raw => {
        const { transport, deliver } = fakeTransport();
        const client = createBridgeClient(transport);
        const listener = jest.fn();
        client.onPush('OnBackPressed', listener);

        expect(() => deliver(raw)).not.toThrow();
        expect(listener).not.toHaveBeenCalled();
    });

    it('times out a request the app never answers', async () => {
        jest.useFakeTimers();
        const { transport } = fakeTransport();
        const client = createBridgeClient(transport, 1000);

        const pending = client.request('Ping');
        jest.advanceTimersByTime(1000);

        await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'TIMEOUT' }));
    });

    it('never times out a request that waits on the user', async () => {
        jest.useFakeTimers();
        const { transport, sent, deliver } = fakeTransport();
        const client = createBridgeClient(transport, 1000);

        const pending = client.request('OpenShareSheet', {}, { timeoutMs: null });
        jest.advanceTimersByTime(60_000);
        deliver({ type: 'OnOpenShareSheet', success: true, data: { action: 'sharedAction' }, refId: sent[0].refId });

        await expect(pending).resolves.toEqual({ action: 'sharedAction' });
    });

    // On Android nothing reaches a hidden page; its replies land when it shows again.
    it('holds a timeout while the page is hidden, and gives the reply time to land after', async () => {
        jest.useFakeTimers();
        const { transport, sent, deliver } = fakeTransport();
        const client = createBridgeClient(transport, 1000);

        const pending = client.request('CopyToClipboard', { text: 'x' });
        jest.advanceTimersByTime(900);
        setVisibility('hidden');
        jest.advanceTimersByTime(60_000);
        setVisibility('visible');
        jest.advanceTimersByTime(1500);
        deliver({ type: 'OnCopyToClipboard', success: true, data: { copied: true }, refId: sent[0].refId });

        await expect(pending).resolves.toEqual({ copied: true });
    });

    it('keeps delivering a push to the other listeners when one throws', () => {
        const { transport, deliver } = fakeTransport();
        const client = createBridgeClient(transport);
        const after = jest.fn();
        client.onPush('OnBackPressed', () => {
            throw new Error('boom');
        });
        client.onPush('OnBackPressed', after);

        deliver({ type: 'OnBackPressed', success: true, data: {}, refId: 'p' });

        expect(after).toHaveBeenCalledTimes(1);
    });

    it('fails what is pending, and what comes after, once closed', async () => {
        const { transport } = fakeTransport();
        const client = createBridgeClient(transport);
        const pending = client.request('Ping');

        client.close();

        await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'DISCONNECTED' }));
        await expect(client.request('Ping')).rejects.toEqual(expect.objectContaining({ code: 'DISCONNECTED' }));
    });

    it('stops listening on close', () => {
        const { transport, deliver } = fakeTransport();
        const client = createBridgeClient(transport);
        const listener = jest.fn();
        client.onPush('OnBackPressed', listener);

        client.close();
        deliver({ type: 'OnBackPressed', success: true, data: {}, refId: 'p' });

        expect(listener).not.toHaveBeenCalled();
    });
});
