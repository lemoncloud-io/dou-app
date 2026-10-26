import { renderHook } from '@testing-library/react';

import { getFoldScript } from '../utils/injectionScripts';
import type { WebViewFold } from '../utils/webViewGeometry';
import { useFoldInjection } from './useFoldInjection';

const vertical: WebViewFold = { axis: 'vertical', start: 455.5, end: 495.5 };

const setup = (initial: WebViewFold | null) => {
    const injectJavaScript = jest.fn();
    const webViewRef = { current: { injectJavaScript } };
    const hook = renderHook(({ fold }) => useFoldInjection(webViewRef, fold), { initialProps: { fold: initial } });
    return { injectJavaScript, ...hook };
};

describe('useFoldInjection', () => {
    it('pushes the device fold into the page whenever it changes', () => {
        const { injectJavaScript, rerender } = setup(null);
        injectJavaScript.mockClear();

        rerender({ fold: vertical });
        rerender({ fold: null });

        expect(injectJavaScript.mock.calls).toEqual([[getFoldScript(vertical)], [getFoldScript(null)]]);
    });

    it('sends the latest device fold again when a page finishes loading, so one reported mid-load is not lost', () => {
        const { injectJavaScript, rerender, result } = setup(null);
        rerender({ fold: vertical });
        injectJavaScript.mockClear();

        result.current();

        expect(injectJavaScript).toHaveBeenCalledWith(getFoldScript(vertical));
    });
});
