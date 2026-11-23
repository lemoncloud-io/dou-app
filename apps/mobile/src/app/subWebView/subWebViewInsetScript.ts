import type { EdgeInsets } from 'react-native-safe-area-context';
import type { SubWebViewSafeArea } from '@chatic/bridge-messages';

export const SUB_WEBVIEW_INSET_PROPERTIES = {
    top: '--chatic-safe-area-inset-top',
    right: '--chatic-safe-area-inset-right',
    bottom: '--chatic-safe-area-inset-bottom',
    left: '--chatic-safe-area-inset-left',
} as const;

export const NO_SUB_WEBVIEW_SAFE_AREA: SubWebViewSafeArea = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

export const subWebViewSafeAreaOf = (insets: EdgeInsets): SubWebViewSafeArea => {
    const edge = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
    return { top: edge(insets.top), right: edge(insets.right), bottom: edge(insets.bottom), left: edge(insets.left) };
};

export const sameSubWebViewSafeArea = (a: SubWebViewSafeArea, b: SubWebViewSafeArea): boolean =>
    a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

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
