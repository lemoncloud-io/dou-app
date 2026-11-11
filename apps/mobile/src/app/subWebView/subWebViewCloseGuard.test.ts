import { createSubWebViewCloseGuard, SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS } from './subWebViewCloseGuard';

describe('createSubWebViewCloseGuard', () => {
    it('lets every close through while the page has not turned it on', () => {
        const guard = createSubWebViewCloseGuard();

        expect(guard.decide(0)).toBe('close');
        expect(guard.decide(1)).toBe('close');
    });

    it('asks first, then lets a second close within the window through', () => {
        const guard = createSubWebViewCloseGuard();
        guard.setEnabled(true);

        expect(guard.decide(1000)).toBe('ask');
        expect(guard.decide(1000 + SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS)).toBe('close');
    });

    it('asks again once the window has passed', () => {
        const guard = createSubWebViewCloseGuard();
        guard.setEnabled(true);

        expect(guard.decide(0)).toBe('ask');
        expect(guard.decide(SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS + 1)).toBe('ask');
        expect(guard.decide(SUB_WEBVIEW_CLOSE_FORCE_WINDOW_MS + 2)).toBe('close');
    });

    // A page that answers every request by turning the guard on again cannot restart the window.
    it('keeps the escape when the page sets the guard again', () => {
        const guard = createSubWebViewCloseGuard();
        guard.setEnabled(true);
        guard.decide(0);

        guard.setEnabled(true);

        expect(guard.decide(1)).toBe('close');
    });

    it('lets the close through once the page turns it off', () => {
        const guard = createSubWebViewCloseGuard();
        guard.setEnabled(true);
        guard.decide(0);

        guard.setEnabled(false);

        expect(guard.decide(1)).toBe('close');
    });
});
