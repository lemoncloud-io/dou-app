import type { SubWebViewContext, SubWebViewDisplay } from '@chatic/bridge-messages';

export const partitionOf = (origin: string): string => `persist:sub-webview:${origin}`;

export const subWebViewWebPreferences = (input: { preload: string; origin: string }) => ({
    preload: input.preload,
    partition: partitionOf(input.origin),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
});

export const subWebViewBootOf = (context: SubWebViewContext, origin: string): { origin: string; script: string } => ({
    origin,
    script: buildDesktopSubWebViewContextScript(context, origin),
});

export const buildDesktopSubWebViewContextScript = (context: SubWebViewContext, openedOrigin: string): string => {
    const literal = (value: unknown) =>
        JSON.stringify(value)
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    return `(function () {
    if (window.location.origin !== ${literal(openedOrigin)}) return;
    if (Object.prototype.hasOwnProperty.call(window, 'ChaticSubWebView')) return;
    var freeze = function (value) {
        if (value && typeof value === 'object') {
            Object.keys(value).forEach(function (key) { freeze(value[key]); });
            Object.freeze(value);
        }
        return value;
    };
    Object.defineProperty(window, 'ChaticSubWebView', {
        value: freeze(JSON.parse(${literal(JSON.stringify(context))})),
        enumerable: true,
        writable: false,
        configurable: false,
    });
})();`;
};

export const SUB_WEBVIEW_BAR_HEIGHT = 44;

const MODAL_MAX_WIDTH = 960;
const MODAL_MARGIN = 40;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const modalLayoutOf = (
    content: { width: number; height: number },
    display: SubWebViewDisplay
): { card: Rect; page: Rect } => {
    const card =
        display === 'clean'
            ? { x: 0, y: 0, width: content.width, height: content.height }
            : (() => {
                  const width = Math.max(0, Math.min(MODAL_MAX_WIDTH, content.width - MODAL_MARGIN * 2));
                  const height = Math.max(0, content.height - MODAL_MARGIN * 2);
                  return { x: Math.round((content.width - width) / 2), y: MODAL_MARGIN, width, height };
              })();
    const page = {
        x: card.x,
        y: card.y + SUB_WEBVIEW_BAR_HEIGHT,
        width: card.width,
        height: Math.max(0, card.height - SUB_WEBVIEW_BAR_HEIGHT),
    };
    return { card, page };
};
