import type { ShareAction } from 'react-native';

import { memoryStorageFile } from '../services/subWebView/memoryStorageFile';
import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import { SubWebViewStorage } from '../services/subWebView/subWebViewStorage';
import type { SubWebViewEvent } from '../services/subWebView/types';
import { createSubBridgeHandlers, PERMISSION_REQUESTS, permittedSubBridgeHandlers } from './subBridgeHandlers';
import { deriveSubWebViewUserKey } from './subWebViewUserKey';

const message = (data: unknown) => ({ type: 'x', data }) as any;

const DEVICE_ID = '6E1C3B0A-9D2F-4C8E-B7A1-2F5D8E3C4B6A';

const setup = () => {
    const storage = new SubWebViewStorage(memoryStorageFile());
    const service = new SubWebViewService(
        { warn: jest.fn(), error: jest.fn() } as any,
        () => 'view-1'
    );
    service.open({ url: 'https://foo.apps.chatic.io/' });
    const events: SubWebViewEvent[] = [];
    service.subscribe(event => events.push(event));
    const deps = {
        viewId: 'view-1',
        service,
        clipboard: { setText: jest.fn(async () => undefined) },
        haptic: { trigger: jest.fn(() => true) },
        openExternal: jest.fn(async () => undefined),
        setTitle: jest.fn(),
        openShareSheet: jest.fn(async (): Promise<ShareAction> => ({ action: 'sharedAction', activityType: null })),
        origin: 'https://foo.apps.chatic.io' as string | null,
        getDeviceId: jest.fn((): string | null => DEVICE_ID),
        setBackClaim: jest.fn(),
        setCloseGuard: jest.fn(),
        logPageError: jest.fn(),
        openStorage: jest.fn((): SubWebViewStorage | null => storage),
        permissions: {
            status: jest.fn(async (): Promise<any> => 'DENIED'),
            request: jest.fn(async (): Promise<any> => 'GRANTED'),
        },
        openSettings: jest.fn(async () => true),
    };
    return { handlers: createSubBridgeHandlers(deps), deps, service, events };
};

describe('createSubBridgeHandlers', () => {
    describe('FinishSubWebView', () => {
        it('closes its own view as page, handing the result on', async () => {
            const { handlers, events } = setup();

            const reply = await handlers.FinishSubWebView(message({ result: { ok: true } }));

            expect(reply).toEqual({ type: 'OnFinishSubWebView', success: true, data: {} });
            expect(events).toEqual([
                { type: 'closed', viewId: 'view-1', reason: 'page', notifyHost: true, result: { ok: true } },
            ]);
        });

        it('closes with no result when the page gives none', async () => {
            const { handlers, events } = setup();

            await handlers.FinishSubWebView(message({}));

            expect(events).toEqual([{ type: 'closed', viewId: 'view-1', reason: 'page', notifyHost: true }]);
        });

        it.each([
            ['over 16 KiB', { blob: 'x'.repeat(16 * 1024) }],
            ['not JSON', { n: BigInt(1) }],
        ])('refuses a result %s, and keeps the view', async (_label, result) => {
            const { handlers, service } = setup();

            const reply = await handlers.FinishSubWebView(message({ result }));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(service.current()).not.toBeNull();
        });

        // The page can only ever finish the view it is in, and only once.
        it('answers NOT_OPEN once its view has closed', async () => {
            const { handlers, service } = setup();
            service.close('view-1', 'user');

            const reply = await handlers.FinishSubWebView(message({}));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'NOT_OPEN' }) })
            );
        });
    });

    describe('SetSubWebViewTitle', () => {
        it('puts the trimmed title in the bar', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetSubWebViewTitle(message({ title: '  Orders  ' }));

            expect(reply).toEqual({ type: 'OnSetSubWebViewTitle', success: true, data: {} });
            expect(deps.setTitle).toHaveBeenCalledWith('Orders');
        });

        it.each([
            ['empty', '   '],
            ['over 100 characters', 'x'.repeat(101)],
            ['not a string', 7],
        ])('refuses a title %s', async (_label, title) => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetSubWebViewTitle(message({ title }));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(deps.setTitle).not.toHaveBeenCalled();
        });
    });

    describe('CopyToClipboard', () => {
        it('writes the text', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.CopyToClipboard(message({ text: 'hello' }));

            expect(reply).toEqual({ type: 'OnCopyToClipboard', success: true, data: { copied: true } });
            expect(deps.clipboard.setText).toHaveBeenCalledWith('hello');
        });

        it('reports a failed write', async () => {
            const { handlers, deps } = setup();
            deps.clipboard.setText.mockRejectedValueOnce(new Error('denied'));

            const reply = await handlers.CopyToClipboard(message({ text: 'hello' }));

            expect(reply).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({ code: 'CLIPBOARD_WRITE_ERROR' }),
                })
            );
        });
    });

    describe('TriggerHaptic', () => {
        it('plays a known kind', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.TriggerHaptic(message({ kind: 'impact' }));

            expect(reply).toEqual({ type: 'OnTriggerHaptic', success: true, data: {} });
            expect(deps.haptic.trigger).toHaveBeenCalledWith('impact');
        });

        it.each(['success', 'warning', 'error'])('plays the outcome kind %s', async kind => {
            const { handlers, deps } = setup();

            const reply = await handlers.TriggerHaptic(message({ kind }));

            expect(reply).toEqual({ type: 'OnTriggerHaptic', success: true, data: {} });
            expect(deps.haptic.trigger).toHaveBeenCalledWith(kind);
        });

        it('refuses an unknown kind', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.TriggerHaptic(message({ kind: 'buzz' }));

            expect(reply).toEqual(expect.objectContaining({ success: false }));
            expect(deps.haptic.trigger).not.toHaveBeenCalled();
        });
    });

    describe('OpenURL', () => {
        it.each(['https://www.naver.com/', 'mailto:help@example.com'])('opens %s in the OS', async url => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenURL(message({ url }));

            expect(reply).toEqual({ type: 'OnOpenURL', success: true, data: {} });
            expect(deps.openExternal).toHaveBeenCalledWith(url);
        });

        // Unlike the main web's OpenURL: never the app's own routing, never another sub WebView page —
        // the hub included.
        it.each([
            'chatic://s/home',
            'https://app.chatic.io/s/abc',
            'https://x@app.chatic.io/s/abc',
            'https://app.chatic.io:443/i',
            'intent://x#Intent;end',
            'https://bar.apps.chatic.io/',
            'https://apps.chatic.io/',
            'https://apps-dev.chatic.io/',
        ])('refuses %s', async url => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenURL(message({ url }));

            expect(reply).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({ code: 'LINK_NOT_ALLOWED' }),
                })
            );
            expect(deps.openExternal).not.toHaveBeenCalled();
        });
    });

    describe('OpenShareSheet', () => {
        it('opens the share sheet with the title, message and link, and reports what happened', async () => {
            const { handlers, deps } = setup();
            deps.openShareSheet.mockResolvedValueOnce({
                action: 'sharedAction',
                activityType: 'com.apple.UIKit.activity.Message',
            });

            const reply = await handlers.OpenShareSheet(
                message({ title: 'Tap game', message: 'I scored 12', url: 'https://foo.apps.chatic.io/?d=10' })
            );

            expect(reply).toEqual({
                type: 'OnOpenShareSheet',
                success: true,
                data: { action: 'sharedAction', activityType: 'com.apple.UIKit.activity.Message' },
            });
            expect(deps.openShareSheet).toHaveBeenCalledWith({
                title: 'Tap game',
                message: 'I scored 12',
                url: 'https://foo.apps.chatic.io/?d=10',
            });
        });

        it('reports a sheet the user dismissed', async () => {
            const { handlers, deps } = setup();
            deps.openShareSheet.mockResolvedValueOnce({ action: 'dismissedAction', activityType: null });

            const reply = await handlers.OpenShareSheet(message({ message: 'hi' }));

            expect(reply).toEqual({
                type: 'OnOpenShareSheet',
                success: true,
                data: { action: 'dismissedAction', activityType: null },
            });
        });

        it('shares a link alone, and passes on only the fields it knows', async () => {
            const { handlers, deps } = setup();

            await handlers.OpenShareSheet(message({ url: 'http://example.com/', type: 'text/plain' }));

            expect(deps.openShareSheet).toHaveBeenCalledWith({
                title: undefined,
                message: undefined,
                url: 'http://example.com/',
            });
        });

        it('takes a scheme in capitals as a web link', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenShareSheet(message({ url: 'HTTPS://EXAMPLE.COM/' }));

            expect(reply).toEqual(expect.objectContaining({ success: true }));
            expect(deps.openShareSheet).toHaveBeenCalledWith({
                title: undefined,
                message: undefined,
                url: 'HTTPS://EXAMPLE.COM/',
            });
        });

        it('treats a null field as left out', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenShareSheet(message({ title: null, message: 'hi', url: null }));

            expect(reply).toEqual(expect.objectContaining({ success: true }));
            expect(deps.openShareSheet).toHaveBeenCalledWith({ title: undefined, message: 'hi', url: undefined });
        });

        // The link is shared, not opened, so the app's own links are text like any other.
        it("shares the app's own link", async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenShareSheet(message({ url: 'https://app.chatic.io/s/abc' }));

            expect(reply).toEqual(expect.objectContaining({ success: true }));
            expect(deps.openShareSheet).toHaveBeenCalled();
        });

        it.each([
            ['nothing to share', {}],
            ['a blank message alone', { message: '   ' }],
            ['an empty url', { message: 'hi', url: '' }],
            ['a message that is not a string', { message: 12 }],
            ['a title over 100 characters', { message: 'hi', title: 'x'.repeat(101) }],
            ['a message over 4000 characters', { message: 'x'.repeat(4001) }],
            ['a url over 2048 characters', { url: `https://example.com/${'x'.repeat(2048)}` }],
        ])('refuses %s', async (_label, data) => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenShareSheet(message(data));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(deps.openShareSheet).not.toHaveBeenCalled();
        });

        // On iOS a file URL hands the OS the file itself, from the app's container.
        it.each([
            'file:///var/mobile/Containers/Data/x.db',
            'chatic://s/home',
            'javascript:alert(1)',
            'not a url',
            'https:',
            'https://',
        ])('refuses to share the url %s', async url => {
            const { handlers, deps } = setup();

            const reply = await handlers.OpenShareSheet(message({ message: 'hi', url }));

            expect(reply).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({ code: 'LINK_NOT_ALLOWED' }),
                })
            );
            expect(deps.openShareSheet).not.toHaveBeenCalled();
        });

        it('reports a share sheet that failed to open', async () => {
            const { handlers, deps } = setup();
            deps.openShareSheet.mockRejectedValueOnce(new Error('no activity'));

            const reply = await handlers.OpenShareSheet(message({ message: 'hi' }));

            expect(reply).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({ code: 'SHARE_ERROR', message: 'no activity' }),
                })
            );
        });
    });

    describe('SetCanGoBack', () => {
        it.each([true, false])('records a claim of %s', async canGoBack => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetCanGoBack(message({ canGoBack }));

            expect(reply).toEqual({ type: 'OnSetCanGoBack', success: true, data: {} });
            expect(deps.setBackClaim).toHaveBeenCalledWith(canGoBack);
        });

        it.each([[{}], [{ canGoBack: 'yes' }], [undefined]])('refuses %j as INVALID', async data => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetCanGoBack(message(data));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(deps.setBackClaim).not.toHaveBeenCalled();
        });
    });

    describe('SetSubWebViewCloseGuard', () => {
        it.each([true, false])('sets the guard to %s', async enabled => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetSubWebViewCloseGuard(message({ enabled }));

            expect(reply).toEqual({ type: 'OnSetSubWebViewCloseGuard', success: true, data: {} });
            expect(deps.setCloseGuard).toHaveBeenCalledWith(enabled);
        });

        it('refuses an enabled that is not a boolean', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.SetSubWebViewCloseGuard(message({ enabled: 1 }));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(deps.setCloseGuard).not.toHaveBeenCalled();
        });
    });

    describe('GetSubWebViewUserKey', () => {
        const keyOf = (overrides: Partial<ReturnType<typeof setup>['deps']>, data: unknown = {}) =>
            createSubBridgeHandlers({ ...setup().deps, ...overrides }).GetSubWebViewUserKey(message(data));

        it("answers this device's key for the opened origin", async () => {
            const reply = await keyOf({});

            expect(reply).toEqual({
                type: 'OnGetSubWebViewUserKey',
                success: true,
                data: { key: deriveSubWebViewUserKey(DEVICE_ID, 'https://foo.apps.chatic.io') },
            });
        });

        it('answers the same key each time on the same origin', async () => {
            const first = await keyOf({});
            const second = await keyOf({});

            expect(second).toEqual(first);
        });

        it('answers another origin a different key', async () => {
            const foo = await keyOf({ origin: 'https://foo.apps.chatic.io' });
            const bar = await keyOf({ origin: 'https://bar.apps.chatic.io' });

            expect([foo.success, bar.success]).toEqual([true, true]);
            expect(bar).not.toEqual(foo);
        });

        it('never puts the device id in the reply', async () => {
            const reply = await keyOf({});

            expect(JSON.stringify(reply)).not.toContain(DEVICE_ID);
            expect(JSON.stringify(reply).toLowerCase()).not.toContain(DEVICE_ID.toLowerCase());
        });

        // The origin is the shell's record; whatever the page writes into the request is ignored.
        it('ignores an origin the page names in the request', async () => {
            const plain = await keyOf({});
            const spoofed = await keyOf(
                {},
                { origin: 'https://bar.apps.chatic.io', url: 'https://bar.apps.chatic.io/' }
            );

            expect(spoofed).toEqual(plain);
        });

        it.each([
            ['no device id', { getDeviceId: jest.fn(() => null) }],
            ['an empty device id', { getDeviceId: jest.fn(() => '') }],
            ["the library's placeholder", { getDeviceId: jest.fn(() => 'unknown') }],
            ['no origin', { origin: null }],
        ])('answers UNAVAILABLE with %s, not a key other devices share', async (_label, deps) => {
            const reply = await keyOf(deps);

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'UNAVAILABLE' }) })
            );
        });
    });

    describe('ReportSubWebViewError', () => {
        it('records the report under the opened origin', async () => {
            const { handlers, deps } = setup();

            const reply = await handlers.ReportSubWebViewError(message({ message: 'boom', stack: 'at x' }));

            expect(reply).toEqual({ type: 'OnReportSubWebViewError', success: true, data: { recorded: true } });
            expect(deps.logPageError).toHaveBeenCalledWith({
                origin: 'https://foo.apps.chatic.io',
                message: 'boom',
                stack: 'at x',
            });
        });

        it('cuts a long message and stack to their limits rather than refusing them', async () => {
            const { handlers, deps } = setup();

            await handlers.ReportSubWebViewError(message({ message: 'm'.repeat(1500), stack: 's'.repeat(5000) }));

            const [report] = deps.logPageError.mock.calls[0];
            expect(report.message).toHaveLength(1000);
            expect(report.stack).toHaveLength(4000);
        });

        it('leaves out a stack that is not a string', async () => {
            const { handlers, deps } = setup();

            await handlers.ReportSubWebViewError(message({ message: 'boom', stack: 42 }));

            expect(deps.logPageError).toHaveBeenCalledWith({ origin: 'https://foo.apps.chatic.io', message: 'boom' });
        });

        it.each([[{}], [{ message: '  ' }], [{ message: 7 }]])('refuses %j as INVALID', async data => {
            const { handlers, deps } = setup();

            const reply = await handlers.ReportSubWebViewError(message(data));

            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
            expect(deps.logPageError).not.toHaveBeenCalled();
        });

        it('records 20 reports per page load, then answers recorded: false', async () => {
            const { handlers, deps } = setup();

            for (let i = 0; i < 20; i += 1) await handlers.ReportSubWebViewError(message({ message: `e${i}` }));
            const reply = await handlers.ReportSubWebViewError(message({ message: 'one more' }));

            expect(deps.logPageError).toHaveBeenCalledTimes(20);
            expect(reply).toEqual({ type: 'OnReportSubWebViewError', success: true, data: { recorded: false } });
        });
    });
});

describe('the storage handlers', () => {
    it('stores, reads back, reports usage, removes and clears', async () => {
        const { handlers } = setup();

        const set = await handlers.SetSubWebViewStorage(message({ entries: { level: 3 } }));
        const got = await handlers.GetSubWebViewStorage(message({ keys: ['level', 'missing'] }));
        const info = await handlers.GetSubWebViewStorageInfo(message({}));
        const removed = await handlers.RemoveSubWebViewStorage(message({ keys: ['level'] }));
        const cleared = await handlers.ClearSubWebViewStorage(message({}));

        expect(set).toEqual({ type: 'OnSetSubWebViewStorage', success: true, data: { used: 6, limit: 1048576 } });
        expect(got).toEqual({ type: 'OnGetSubWebViewStorage', success: true, data: { entries: { level: 3 } } });
        expect(info).toEqual(expect.objectContaining({ data: { keys: ['level'], used: 6, limit: 1048576 } }));
        expect(removed).toEqual(expect.objectContaining({ data: { used: 0, limit: 1048576 } }));
        expect(cleared).toEqual({ type: 'OnClearSubWebViewStorage', success: true, data: {} });
    });

    it('answers QUOTA_EXCEEDED and INVALID with their codes', async () => {
        const { handlers } = setup();

        const tooMuch = await handlers.SetSubWebViewStorage(message({ entries: { a: 'x'.repeat(1048576) } }));
        const badKey = await handlers.GetSubWebViewStorage(message({ keys: [''] }));

        expect(tooMuch).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'QUOTA_EXCEEDED' }) })
        );
        expect(badKey).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
        );
    });

    it('answers UNAVAILABLE when the view has no storage', async () => {
        const { deps } = setup();
        const handlers = createSubBridgeHandlers({ ...deps, openStorage: () => null });

        const reply = await handlers.GetSubWebViewStorageInfo(message({}));

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'UNAVAILABLE' }) })
        );
    });
});

describe('permittedSubBridgeHandlers', () => {
    const all = () => createSubBridgeHandlers(setup().deps);

    it('keeps the base set and drops every gated request for a page with no permissions', () => {
        const kept = Object.keys(permittedSubBridgeHandlers(all(), new Set()));

        expect(kept.sort()).toEqual(
            [
                'FinishSubWebView',
                'SetSubWebViewTitle',
                'TriggerHaptic',
                'SetCanGoBack',
                'SetSubWebViewCloseGuard',
                'ReportSubWebViewError',
                'GetSubWebViewStorage',
                'SetSubWebViewStorage',
                'RemoveSubWebViewStorage',
                'ClearSubWebViewStorage',
                'GetSubWebViewStorageInfo',
                'GetSubWebViewPermission',
                'RequestSubWebViewPermission',
                'OpenSettings',
            ].sort()
        );
    });

    it.each(Object.entries(PERMISSION_REQUESTS))('adds %s as %s', (permission, request) => {
        const kept = permittedSubBridgeHandlers(all(), new Set([permission as never]));

        expect(kept).toHaveProperty(request);
        expect(Object.keys(kept)).toHaveLength(15);
    });
});

describe('the device permission handlers', () => {
    it.each([
        ['GRANTED', 'granted'],
        ['DENIED', 'prompt'],
        ['BLOCKED', 'blocked'],
    ])('reads the OS status %s as %s, asking nothing', async (status, state) => {
        const { handlers, deps } = setup();
        deps.permissions.status.mockResolvedValueOnce(status);

        const reply = await handlers.GetSubWebViewPermission(message({ kind: 'camera' }));

        expect(deps.permissions.status).toHaveBeenCalledWith('CAMERA');
        expect(deps.permissions.request).not.toHaveBeenCalled();
        expect(reply).toEqual({ type: 'OnGetSubWebViewPermission', success: true, data: { state } });
    });

    it('maps the microphone to its own OS permission', async () => {
        const { handlers, deps } = setup();

        await handlers.GetSubWebViewPermission(message({ kind: 'microphone' }));

        expect(deps.permissions.status).toHaveBeenCalledWith('MICROPHONE');
    });

    it('fails a query on a device without the hardware', async () => {
        const { handlers, deps } = setup();
        deps.permissions.status.mockResolvedValueOnce('UNAVAILABLE');

        const reply = await handlers.GetSubWebViewPermission(message({ kind: 'camera' }));

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'UNAVAILABLE' }) })
        );
    });

    it.each([
        ['GRANTED', 'granted'],
        ['DENIED', 'prompt'],
        ['BLOCKED', 'blocked'],
    ])('reads the OS answer %s to a request as %s', async (answer, state) => {
        const { handlers, deps } = setup();
        deps.permissions.request.mockResolvedValueOnce(answer);

        const reply = await handlers.RequestSubWebViewPermission(message({ kind: 'microphone' }));

        expect(deps.permissions.request).toHaveBeenCalledWith('MICROPHONE');
        expect(reply).toEqual({ type: 'OnRequestSubWebViewPermission', success: true, data: { state } });
    });

    it('puts the OS prompt up once for a page that asks twice at the same time', async () => {
        const { handlers, deps } = setup();
        let answer: (value: string) => void = () => undefined;
        deps.permissions.request.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));

        const first = handlers.RequestSubWebViewPermission(message({ kind: 'camera' }));
        const second = handlers.RequestSubWebViewPermission(message({ kind: 'camera' }));
        await new Promise(resolve => setTimeout(resolve, 0));
        answer('GRANTED');

        await expect(Promise.all([first, second])).resolves.toEqual([
            expect.objectContaining({ data: { state: 'granted' } }),
            expect.objectContaining({ data: { state: 'granted' } }),
        ]);
        expect(deps.permissions.request).toHaveBeenCalledTimes(1);
    });

    it('asks again once the first request has been answered', async () => {
        const { handlers, deps } = setup();

        await handlers.RequestSubWebViewPermission(message({ kind: 'camera' }));
        await handlers.RequestSubWebViewPermission(message({ kind: 'camera' }));

        expect(deps.permissions.request).toHaveBeenCalledTimes(2);
    });

    it('does not ask the OS on a device without the hardware', async () => {
        const { handlers, deps } = setup();
        deps.permissions.status.mockResolvedValueOnce('UNAVAILABLE');

        const reply = await handlers.RequestSubWebViewPermission(message({ kind: 'camera' }));

        expect(deps.permissions.request).not.toHaveBeenCalled();
        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'UNAVAILABLE' }) })
        );
    });

    it.each([undefined, 'location', 3, null])('refuses the kind %p as INVALID, in both requests', async kind => {
        const { handlers, deps } = setup();

        for (const reply of [
            await handlers.GetSubWebViewPermission(message({ kind })),
            await handlers.RequestSubWebViewPermission(message({ kind })),
        ]) {
            expect(reply).toEqual(
                expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
            );
        }
        expect(deps.permissions.request).not.toHaveBeenCalled();
    });

    it('opens the settings, and says so when the OS would not', async () => {
        const { handlers, deps } = setup();

        await expect(handlers.OpenSettings(message({}))).resolves.toEqual({
            type: 'OnOpenSettings',
            success: true,
            data: {},
        });

        deps.openSettings.mockResolvedValueOnce(false);
        await expect(handlers.OpenSettings(message({}))).resolves.toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'SETTINGS_ERROR' }) })
        );
    });
});
