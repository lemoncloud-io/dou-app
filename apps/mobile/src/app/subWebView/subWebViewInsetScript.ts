import type { EdgeInsets } from 'react-native-safe-area-context';
import type { SubWebViewSafeArea } from '@chatic/bridge-messages';

/** The custom properties the shell sets on an `immersive` page's root element, by edge. */
export const SUB_WEBVIEW_INSET_PROPERTIES = {
    top: '--chatic-safe-area-inset-top',
    right: '--chatic-safe-area-inset-right',
    bottom: '--chatic-safe-area-inset-bottom',
    left: '--chatic-safe-area-inset-left',
} as const;

/** Every edge 0: what a padded page is told, since the shell keeps it clear of the bars itself. */
export const NO_SUB_WEBVIEW_SAFE_AREA: SubWebViewSafeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/**
 * The insets as a page is told them, in CSS pixels: a value that is not a finite number reads 0, and
 * none is negative. The one measurement both the custom properties and the context's `safeArea` come
 * from, so the two never disagree.
 */
export const subWebViewSafeAreaOf = (insets: EdgeInsets): SubWebViewSafeArea => {
    const edge = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
    return { top: edge(insets.top), right: edge(insets.right), bottom: edge(insets.bottom), left: edge(insets.left) };
};

/** Whether two safe areas are the same on every edge. */
export const sameSubWebViewSafeArea = (a: SubWebViewSafeArea, b: SubWebViewSafeArea): boolean =>
    a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

/**
 * The script that tells an `immersive` page how far each system bar reaches into it, as custom
 * properties on `<html>`. `env(safe-area-inset-*)` should say the same, but cannot be relied on alone:
 * WKWebView reports it only to a page with `viewport-fit=cover`, and the Android WebView forwards the
 * system bars to it only from Chromium M136, so an older WebView reads 0 there and the page's
 * controls would sit under the status bar. The main WebView is told its insets the same way.
 *
 * Android can run a script before the document has a root element. The script then waits for the
 * root to be added rather than for the run at load end, which comes after the page has painted —
 * seconds, on a slow page, of controls under the status bar where `env()` reads 0.
 */
export const buildSubWebViewInsetScript = (insets: EdgeInsets): string => {
    const safeArea = subWebViewSafeAreaOf(insets);
    const lines = (Object.keys(SUB_WEBVIEW_INSET_PROPERTIES) as Array<keyof typeof SUB_WEBVIEW_INSET_PROPERTIES>).map(
        edge =>
            `root.style.setProperty(${JSON.stringify(SUB_WEBVIEW_INSET_PROPERTIES[edge])}, ${JSON.stringify(
                `${safeArea[edge]}px`
            )});`
    );
    return `(function () {
    var apply = function (root) {
        ${lines.join('\n        ')}
    };
    if (document.documentElement) return apply(document.documentElement);
    new MutationObserver(function (_, observer) {
        if (!document.documentElement) return;
        observer.disconnect();
        apply(document.documentElement);
    }).observe(document, { childList: true });
})();
true;`;
};
