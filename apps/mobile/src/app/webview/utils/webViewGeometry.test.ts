import { toWebViewInsets } from './webViewGeometry';

describe('toWebViewInsets', () => {
    it('pads the WebView by the horizontal insets and reports none of them to the web', () => {
        // iPhone Duo's outer display: the status bar and Dynamic Island sit on the trailing edge.
        const result = toWebViewInsets({ top: 0, bottom: 20, left: 0, right: 84 });

        expect(result.padding).toEqual({ paddingLeft: 0, paddingRight: 84 });
        expect(result.web).toEqual({ top: 0, bottom: 20, left: 0, right: 0 });
    });

    it('passes top and bottom through untouched, so the web keeps owning them', () => {
        const result = toWebViewInsets({ top: 59, bottom: 34, left: 0, right: 0 });

        expect(result.padding).toEqual({ paddingLeft: 0, paddingRight: 0 });
        expect(result.web).toEqual({ top: 59, bottom: 34, left: 0, right: 0 });
    });

    it('handles a leading inset the same way (landscape with the notch on the left)', () => {
        const result = toWebViewInsets({ top: 0, bottom: 21, left: 59, right: 59 });

        expect(result.padding).toEqual({ paddingLeft: 59, paddingRight: 59 });
        expect(result.web.left).toBe(0);
        expect(result.web.right).toBe(0);
    });
});
