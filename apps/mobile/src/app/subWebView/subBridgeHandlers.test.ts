import { SubWebViewService } from '../services/subWebView/SubWebViewService';
import type { SubWebViewEvent } from '../services/subWebView/types';
import { createSubBridgeHandlers } from './subBridgeHandlers';

const message = (data: unknown) => ({ type: 'x', data }) as any;

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
});
