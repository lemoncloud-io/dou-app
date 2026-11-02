import { SubWebViewService } from '../../services/subWebView/SubWebViewService';
import { pushedEventErrors, pushedEvents } from './appEventContract';
import { createSubWebViewHandlers, forwardSubWebViewClosed } from './subWebViewHandlers';

const createService = () =>
    new SubWebViewService({ warn: jest.fn(), error: jest.fn() } as any, ['apps.chatic.io'], () => 'view-1');

const message = <T>(type: string, data: T) => ({ type, data }) as any;

describe('createSubWebViewHandlers', () => {
    it('answers OnOpenSubWebView with the new viewId', async () => {
        const { handleOpenSubWebView } = createSubWebViewHandlers(createService());

        const reply = await handleOpenSubWebView(message('OpenSubWebView', { url: 'https://foo.apps.chatic.io/a' }));

        expect(reply).toEqual({ type: 'OnOpenSubWebView', success: true, data: { viewId: 'view-1' } });
    });

    it("fails OnOpenSubWebView with the service's code", async () => {
        const { handleOpenSubWebView } = createSubWebViewHandlers(createService());

        const reply = await handleOpenSubWebView(message('OpenSubWebView', { url: 'https://evil.example/' }));

        expect(reply).toEqual({
            type: 'OnOpenSubWebView',
            success: false,
            error: expect.objectContaining({ code: 'NOT_ALLOWED' }),
        });
    });

    it('answers INVALID rather than throwing for a message with no data', async () => {
        const { handleOpenSubWebView } = createSubWebViewHandlers(createService());

        const reply = await handleOpenSubWebView(message('OpenSubWebView', undefined));

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'INVALID' }) })
        );
    });

    it('closes the view as the host asked', async () => {
        const service = createService();
        const { handleOpenSubWebView, handleCloseSubWebView } = createSubWebViewHandlers(service);
        await handleOpenSubWebView(message('OpenSubWebView', { url: 'https://foo.apps.chatic.io/a' }));

        const reply = await handleCloseSubWebView(message('CloseSubWebView', { viewId: 'view-1' }));

        expect(reply).toEqual({ type: 'OnCloseSubWebView', success: true, data: {} });
        expect(service.current()).toBeNull();
    });

    it('fails OnCloseSubWebView with NOT_OPEN for a view that is gone', async () => {
        const { handleCloseSubWebView } = createSubWebViewHandlers(createService());

        const reply = await handleCloseSubWebView(message('CloseSubWebView', { viewId: 'view-1' }));

        expect(reply).toEqual(
            expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'NOT_OPEN' }) })
        );
    });
});

describe('forwardSubWebViewClosed', () => {
    it('pushes OnSubWebViewClosed, in the contract shape, when a view closes', () => {
        const service = createService();
        const bridge = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, bridge as any);
        service.open({ url: 'https://foo.apps.chatic.io/a' });

        service.close('view-1', 'user');

        const events = pushedEvents(bridge.pushEvent);
        expect(events).toEqual([
            expect.objectContaining({ type: 'OnSubWebViewClosed', data: { viewId: 'view-1', reason: 'user' } }),
        ]);
        expect(pushedEventErrors(events)).toEqual([]);
    });

    // The page that opened the view is gone; the page that replaced it never asked.
    it('pushes nothing when the web reloaded under the view', () => {
        const service = createService();
        const bridge = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, bridge as any);
        service.open({ url: 'https://foo.apps.chatic.io/a' });

        service.resetForNewHost();

        expect(bridge.pushEvent).not.toHaveBeenCalled();
    });

    it('pushes nothing for an open', () => {
        const service = createService();
        const bridge = { pushEvent: jest.fn() };
        forwardSubWebViewClosed(service, bridge as any);

        service.open({ url: 'https://foo.apps.chatic.io/a' });

        expect(bridge.pushEvent).not.toHaveBeenCalled();
    });
});
