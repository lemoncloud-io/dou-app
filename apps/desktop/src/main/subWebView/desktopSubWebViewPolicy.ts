import type { SubWebViewContext, SubWebViewDisplay } from '@chatic/bridge-messages';
// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; the sub-webview trust rules move to a platform-free mini-app protocol package
import {
    SUB_WEBVIEW_TITLE_LIMIT,
    subWebViewDisplayOf,
    subWebViewOriginOf,
    type SubWebViewTrust,
} from '@chatic/shared/subWebViewTrust';

export type DesktopSubWebViewNavigation = 'load' | 'external' | 'block';

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const AMBIGUOUS_WEB_URL = /^https?:\/\/[^/?#]*@|[\\\s\u0000-\u001f\u007f]/i;

const DEEP_LINK_PATTERN = /^https?:\/\/app(?:-dev)?\.chatic\.io\.?(?::\d*)?\/(?:i|s)(?:[/?#]|$)/i;

export const decideDesktopSubWebViewNavigation = (url: string, openedOrigin: string): DesktopSubWebViewNavigation => {
    if (url === 'about:blank') return 'load';
    if (AMBIGUOUS_WEB_URL.test(url)) return 'block';
    const origin = subWebViewOriginOf(url);
    if (origin === openedOrigin) return 'load';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return origin ? 'external' : 'block';
};

const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

export const allowsSubWebViewFrame = (url: string): boolean => {
    const scheme = /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();
    return !!scheme && FRAME_SCHEMES.includes(scheme);
};

export const acceptsSubWebViewMessage = (
    sender: { url: string | undefined; isMainFrame: boolean },
    openedOrigin: string
): boolean => sender.isMainFrame && !!sender.url && subWebViewOriginOf(sender.url) === openedOrigin;

export const readDesktopSubWebViewManifest = (json: unknown): { name?: string; display?: SubWebViewDisplay } => {
    if (!json || typeof json !== 'object' || (json as { manifestVersion?: unknown }).manifestVersion !== 1) return {};
    const { name, display: declared } = json as { name?: unknown; display?: unknown };
    const display = subWebViewDisplayOf(declared);
    return {
        ...(typeof name === 'string' && name.trim() && name.length <= SUB_WEBVIEW_TITLE_LIMIT
            ? { name: name.trim() }
            : {}),
        ...(display ? { display: display === 'immersive' ? ('clean' as const) : display } : {}),
    };
};

export const fetchesManifest = (trust: SubWebViewTrust): boolean => trust !== 'external';

export const displayOf = (trust: SubWebViewTrust, manifest: { display?: SubWebViewDisplay }): SubWebViewDisplay =>
    trust === 'external' ? 'titled' : (manifest.display ?? 'titled');

export const barTitleOf = (
    view: { trust: SubWebViewTrust; origin: string; title?: string },
    shown: { requested?: string; document?: string; manifestName?: string }
): string => {
    const host = view.origin.replace(/^https:\/\//, '');
    if (view.trust === 'external') return host;
    const pick = [shown.requested, shown.document, view.title, shown.manifestName].find(
        title => typeof title === 'string' && title.trim()
    );
    return pick ? pick.trim().slice(0, SUB_WEBVIEW_TITLE_LIMIT) : host;
};

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
