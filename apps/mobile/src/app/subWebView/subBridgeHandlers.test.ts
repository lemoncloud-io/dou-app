import type { ShareAction } from 'react-native';

import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import type { SubWebViewEvent } from '../services/subWebView/types';
import { createSubBridgeHandlers } from './subBridgeHandlers';
import { deriveSubWebViewUserKey } from './subWebViewUserKey';

const message = (data: unknown) => ({ type: 'x', data }) as any;

const DEVICE_ID = '6E1C3B0A-9D2F-4C8E-B7A1-2F5D8E3C4B6A';

const setup = () => {
    const service = new SubWebViewService(
        { warn: jest.fn(), error: jest.fn() } as any,
        ['apps.chatic.io'],
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

        // Unlike the main web's OpenURL: never the app's own routing, never another sub WebView page.
        it.each([
            'chatic://s/home',
            'https://app.chatic.io/s/abc',
            'https://x@app.chatic.io/s/abc',
            'https://app.chatic.io:443/i',
            'intent://x#Intent;end',
            'https://bar.apps.chatic.io/',
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
});
