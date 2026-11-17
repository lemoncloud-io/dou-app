import type { EdgeInsets } from 'react-native-safe-area-context';

/** The custom properties the shell sets on an `immersive` page's root element, by edge. */
export const SUB_WEBVIEW_INSET_PROPERTIES = {
    top: '--chatic-safe-area-inset-top',
    right: '--chatic-safe-area-inset-right',
    bottom: '--chatic-safe-area-inset-bottom',
    left: '--chatic-safe-area-inset-left',
} as const;

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
    const lines = (Object.keys(SUB_WEBVIEW_INSET_PROPERTIES) as Array<keyof typeof SUB_WEBVIEW_INSET_PROPERTIES>).map(
        edge =>
            `root.style.setProperty(${JSON.stringify(SUB_WEBVIEW_INSET_PROPERTIES[edge])}, ${JSON.stringify(
                `${Number.isFinite(insets[edge]) ? Math.max(0, insets[edge]) : 0}px`
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
