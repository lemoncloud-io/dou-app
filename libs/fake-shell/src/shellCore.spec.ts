import { ShellCore, type ShellTraffic } from './shellCore';
import { ShellFailure } from './handlerTable';

/** A transport that records what it dispatched; `answer` decides each delivery's outcome. */
const recordingTransport = (answer: (raw: string) => boolean | Promise<boolean> = () => true) => {
    const sent: Array<{ type: string; [key: string]: unknown }> = [];
    return {
        sent,
        transport: {
            deliver: async (raw: string) => {
                const delivered = await answer(raw);
                if (delivered) sent.push(JSON.parse(raw));
                return delivered;
            },
        },
    };
};

const post = (core: ShellCore, message: Record<string, unknown>) => core.receive(JSON.stringify(message));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('ShellCore', () => {
    it('reports the handlers it has in the handshake, and answers NOT_FOUND for the rest', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport, supportedCacheTypes: ['chat'] });
        core.use({ FetchBadgeBase: () => ({ base: 3 }) });

        await post(core, { type: 'WebAppReady', refId: 'r1', data: {} });
        await post(core, { type: 'FetchBadgeBase', refId: 'r2' });
        await post(core, { type: 'ListPhotos', refId: 'r3' });
        await flush();

        const ready = sent.find(message => message.type === 'OnWebAppReady') as unknown as {
            data: { supportedWebMessages: string[]; supportedCacheTypes: string[] };
        };
        expect(ready.data.supportedWebMessages).toEqual(expect.arrayContaining(['WebAppReady', 'FetchBadgeBase']));
        expect(ready.data.supportedWebMessages).not.toContain('ListPhotos');
        expect(ready.data.supportedCacheTypes).toEqual(['chat']);
        expect(sent.find(message => message.refId === 'r2')).toMatchObject({
            type: 'OnFetchBadgeBase',
            data: { base: 3 },
        });
        expect(sent.find(message => message.refId === 'r3')).toMatchObject({
            type: 'ERROR',
            error: { code: 'NOT_FOUND' },
        });
        expect(core.unhandled).toEqual(['ListPhotos']);
        expect(core.handles('FetchBadgeBase')).toBe(true);
        expect(core.handles('ListPhotos')).toBe(false);
    });

    it('answers a ShellFailure as a failed reply of the paired type', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport });
        core.handle('FetchBadgeBase', () => new ShellFailure('BUSY'));

        await post(core, { type: 'FetchBadgeBase', refId: 'r1' });
        await flush();

        expect(sent[0]).toMatchObject({ type: 'OnFetchBadgeBase', success: false, error: { code: 'BUSY' } });
    });

    it('holds a pushed event until the page shakes hands, and again after a reboot', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport });

        core.push('OnBackPressed', {});
        await flush();
        expect(sent).toEqual([]);

        await post(core, { type: 'WebAppReady', refId: 'r1', data: {} });
        await flush();
        expect(sent.map(message => message.type)).toEqual(['OnBackPressed', 'OnWebAppReady']);

        core.reboot();
        core.push('OnBackPressed', {});
        await flush();
        expect(sent).toHaveLength(2);

        await post(core, { type: 'WebAppReady', refId: 'r2', data: {} });
        await flush();
        expect(sent.map(message => message.type).slice(2)).toEqual(['OnBackPressed', 'OnWebAppReady']);
    });

    it('keeps its handlers across a reboot', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport });
        core.use({ FetchBadgeBase: () => ({ base: 7 }) });

        core.reboot();
        await post(core, { type: 'FetchBadgeBase', refId: 'r1' });
        await flush();

        expect(sent[0]).toMatchObject({ type: 'OnFetchBadgeBase', data: { base: 7 } });
    });

    it('shows each crossing to an observer in both directions, and stops when told', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });
        const seen: ShellTraffic[] = [];
        const stop = core.observe(traffic => seen.push(traffic));

        await post(core, { type: 'WebAppReady', refId: 'r1', data: {} });
        await flush();
        stop();
        await post(core, { type: 'Ping', refId: 'r2', data: {} });
        await flush();

        expect(seen.map(traffic => [traffic.direction, traffic.message?.type])).toEqual([
            ['web→shell', 'WebAppReady'],
            ['shell→web', 'OnWebAppReady'],
        ]);
    });

    it('treats a page that went away as dropped, and any other failure as a delivery error', async () => {
        let outcome: 'gone' | 'broken' = 'gone';
        const { transport } = recordingTransport(() => {
            if (outcome === 'broken') throw new Error('dispatch failed');
            return false;
        });
        const core = new ShellCore({ transport });
        const seen: ShellTraffic[] = [];
        core.observe(traffic => seen.push(traffic));

        await post(core, { type: 'Ping', refId: 'r1', data: {} });
        await flush();
        outcome = 'broken';
        await post(core, { type: 'Ping', refId: 'r2', data: {} });
        await flush();

        expect(seen.filter(traffic => traffic.direction === 'shell→web')).toEqual([]);
        expect(core.deliveryErrors).toEqual(['Error: dispatch failed']);
    });

    it('resolves delivered() once the event is dispatched, and names what was dispatched on a timeout', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });
        core.push('OnBackPressed', {});
        const waiting = core.delivered('OnBackPressed');

        await post(core, { type: 'WebAppReady', refId: 'r1', data: {} });
        await expect(waiting).resolves.toBeUndefined();
        await expect(core.delivered('OnNavigate', { timeout: 10 })).rejects.toThrow(
            'delivered(OnNavigate) timed out after 10ms; the shell dispatched: OnBackPressed, OnWebAppReady'
        );
    });

    it('resolves waitFor() with a message already received or the next to arrive', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });
        await post(core, { type: 'SetCanGoBack', refId: 'r1', data: { canGoBack: false } });

        await expect(core.waitFor('SetCanGoBack')).resolves.toMatchObject({ data: { canGoBack: false } });
        const next = core.waitFor('SetCanGoBack', message => message.data.canGoBack);
        await post(core, { type: 'SetCanGoBack', refId: 'r2', data: { canGoBack: true } });
        await expect(next).resolves.toMatchObject({ refId: 'r2' });
        await expect(core.waitFor('Purchase', undefined, { timeout: 10 })).rejects.toThrow(
            'waitFor(Purchase) timed out after 10ms; the page sent: SetCanGoBack'
        );
    });

    it('records a failure the injection script reported about itself', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });

        await post(core, { type: 'SendLog', data: { tag: 'INJECTION', message: 'Injected script failed: boom' } });
        await post(core, { type: 'SendLog', data: { tag: 'BRIDGE', message: 'unrelated' } });

        expect(core.injectionErrors).toEqual(['Injected script failed: boom']);
    });
    it('drops a reply the host from before a reboot sends late, as a killed app loses it', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport });
        let answer: (value: { base: number }) => void = () => undefined;
        core.handle('FetchBadgeBase', () => new Promise(resolve => (answer = resolve)));
        await post(core, { type: 'WebAppReady', refId: 'r0', data: {} });

        const asked = post(core, { type: 'FetchBadgeBase', refId: 'slow' });
        core.reboot();
        answer({ base: 1 });
        await asked;
        await flush();

        expect(sent.find(message => message.refId === 'slow')).toBeUndefined();
    });

    it('reports itself ready once its page has sent anything but a log line, and not after a reboot', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });

        await post(core, { type: 'SendLog', data: { tag: 'BOOT', message: 'x' } });
        expect(core.ready).toBe(false);
        await post(core, { type: 'WebAppReady', refId: 'r1', data: {} });
        expect(core.ready).toBe(true);
        core.reboot();
        expect(core.ready).toBe(false);
    });

    it('counts the probe the host answers itself as answered', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport });

        await post(core, { type: 'Ping', refId: 'p1', data: {} });

        expect(core.unhandled).toEqual([]);
        expect(core.handles('Ping')).toBe(true);
    });

    it('keeps nothing of the traffic when told not to', async () => {
        const { transport } = recordingTransport();
        const core = new ShellCore({ transport, retainTraffic: false });

        await post(core, { type: 'ListPhotos', refId: 'r1' });
        await flush();

        expect(core.received('ListPhotos')).toEqual([]);
        expect(core.unhandled).toEqual([]);
    });

    it('still answers when an observer throws', async () => {
        const { sent, transport } = recordingTransport();
        const core = new ShellCore({ transport });
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        core.observe(() => {
            throw new Error('observer broke');
        });

        await post(core, { type: 'Ping', refId: 'p1', data: {} });
        await flush();

        expect(sent.find(message => message.refId === 'p1')).toMatchObject({ type: 'Pong' });
        error.mockRestore();
    });
});
