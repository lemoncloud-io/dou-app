import { toWebViewFold, toWebViewInsets } from './webViewGeometry';

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

describe('toWebViewFold', () => {
    // iPhone Duo's inner display, half-open: the division runs top to bottom down the middle.
    const vertical = { x: 465, y: 0, width: 21, height: 669 };

    it('reports a vertical device fold in WebView px when the WebView starts at the window edge', () => {
        expect(toWebViewFold(vertical, 0)).toEqual({ axis: 'vertical', start: 465, end: 486 });
    });

    it('moves a vertical device fold left by the inset the shell pads the WebView with', () => {
        expect(toWebViewFold(vertical, 59)).toEqual({ axis: 'vertical', start: 406, end: 427 });
    });

    it('reports a horizontal device fold by its top and bottom edges, which the inset does not move', () => {
        expect(toWebViewFold({ x: 0, y: 320, width: 669, height: 21 }, 59)).toEqual({
            axis: 'horizontal',
            start: 320,
            end: 341,
        });
    });

    it('reports no device fold when UIKit reports none', () => {
        expect(toWebViewFold(null, 59)).toBeNull();
    });
});
