/**
 * The decisions the desktop sub view makes, kept apart from the electron code that acts on them so
 * jest can run them: where a navigation goes, which messages are heard, what the bar shows, how the
 * view is configured. `desktopSubWebViewWindow.ts` is the only caller.
 */
import type { SubWebViewContext, SubWebViewDisplay } from '@chatic/bridge-messages';
import { SUB_WEBVIEW_TITLE_LIMIT, subWebViewOriginOf, type SubWebViewTrust } from '@chatic/shared/subWebViewTrust';

/** What the view does with a navigation: load it in place, hand it to the OS browser, or drop it. */
export type DesktopSubWebViewNavigation = 'load' | 'external' | 'block';

// A web URL the OS could read differently from the shared check: userinfo before the host, a
// backslash, whitespace or a control character. Not handed on at all.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const AMBIGUOUS_WEB_URL = /^https?:\/\/[^/?#]*@|[\\\s\u0000-\u001f\u007f]/i;

// The app's invite and share link paths. Handed to the OS they would re-enter DoU through its own
// link handling, which a page in the sub view does not get to drive.
const DEEP_LINK_PATTERN = /^https?:\/\/app(?:-dev)?\.chatic\.io\.?(?::\d*)?\/(?:i|s)(?:[/?#]|$)/i;

/**
 * Decides a top-level navigation in the view, and a `window.open` from it. Only the origin the view
 * was opened on loads — a page may not walk the view to another site, which would then sit under the
 * first one's bar and its `params`. Another plain https URL goes to the OS browser; every other
 * scheme, an ambiguous URL and DoU's own links are dropped.
 */
export const decideDesktopSubWebViewNavigation = (url: string, openedOrigin: string): DesktopSubWebViewNavigation => {
    if (url === 'about:blank') return 'load';
    if (AMBIGUOUS_WEB_URL.test(url)) return 'block';
    const origin = subWebViewOriginOf(url);
    if (origin === openedOrigin) return 'load';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return origin ? 'external' : 'block';
};

// What a frame inside the page may load. A frame reaches no host — the preload runs in the main
// frame only, and main drops any message not sent from it — so any https or in-memory document may.
const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

/** Whether a frame inside the page may navigate to `url`. Nothing a frame asks for reaches the OS. */
export const allowsSubWebViewFrame = (url: string): boolean => {
    const scheme = /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();
    return !!scheme && FRAME_SCHEMES.includes(scheme);
};

/**
 * Whether a message the view's preload relayed is the opened page's: sent from the view's main
 * frame while it shows the opened origin. A frame, or the page after it left for an origin a server
 * redirect reached, is not heard — the host answers only the origin the user was shown.
 */
export const acceptsSubWebViewMessage = (
    sender: { url: string | undefined; isMainFrame: boolean },
    openedOrigin: string
): boolean => sender.isMainFrame && !!sender.url && subWebViewOriginOf(sender.url) === openedOrigin;

/**
 * A page's manifest, as far as this shell reads it: the bar's fallback name and the display. The
 * desktop page host has no permission-gated requests, so `permissions` grants nothing here and is not
 * read. Anything malformed is ignored field by field, as on the phone.
 */
export const readDesktopSubWebViewManifest = (json: unknown): { name?: string; display?: SubWebViewDisplay } => {
    if (!json || typeof json !== 'object' || (json as { manifestVersion?: unknown }).manifestVersion !== 1) return {};
    const { name, display } = json as { name?: unknown; display?: unknown };
    return {
        ...(typeof name === 'string' && name.trim() && name.length <= SUB_WEBVIEW_TITLE_LIMIT
            ? { name: name.trim() }
            : {}),
        ...(display === 'standard' || display === 'fullscreen' ? { display } : {}),
    };
};

/** Whether the shell asks the page's own server for a manifest: never for an external site. */
export const fetchesManifest = (trust: SubWebViewTrust): boolean => trust !== 'external';

/**
 * How the view is shown. An external site is always `standard` — a modal without a bar would let a
 * third-party page draw what looks like DoU's own screen. A trusted page takes its manifest's display,
 * `standard` by default on the desktop: the phone's full-screen default exists for a phone's size.
 */
export const displayOf = (trust: SubWebViewTrust, manifest: { display?: SubWebViewDisplay }): SubWebViewDisplay =>
    trust === 'external' ? 'standard' : (manifest.display ?? 'standard');

/**
 * What the bar shows. For an external site, its host and nothing else: the page's own title, and
 * the title the web or the page asked for, could each claim to be something it is not. A trusted page
 * shows, first to last, what it asked for, its document's title, what the web opened it with, its
 * manifest's name, and its host.
 */
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

/**
 * The session a page runs in: one per origin and kept on disk, so a page keeps its own storage across
 * launches the way the phone keeps a page's storage per origin, and no page — nor the main window —
 * shares cookies or storage with another.
 */
export const partitionOf = (origin: string): string => `persist:sub-webview:${origin}`;

/**
 * The page view's `webPreferences`: the same isolation as the main window, plus its own session. The
 * preload is the sub view's own, which exposes the page channel and nothing of the main window's.
 * Nothing about the page rides in `additionalArguments`: the preload asks for it (`subWebViewBootOf`).
 */
export const subWebViewWebPreferences = (input: { preload: string; origin: string }) => ({
    preload: input.preload,
    partition: partitionOf(input.origin),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
});

/** What the preload is told when it asks: the opened origin, and the script that defines the context there. */
export const subWebViewBootOf = (context: SubWebViewContext, origin: string): { origin: string; script: string } => ({
    origin,
    script: buildDesktopSubWebViewContextScript(context, origin),
});

/**
 * The script the preload runs before the page's own: defines `window.ChaticSubWebView` on the opened
 * origin only, frozen all the way down, neither reassignable nor redefinable. The context is parsed
 * from a JSON string rather than written as an object literal, so a `"__proto__"` key in `params`
 * stays a key; the two line separators older parsers reject in a string are escaped.
 */
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

/** Height of the shell's bar over the page, in pixels. */
export const SUB_WEBVIEW_BAR_HEIGHT = 44;

/** The modal's widest and its margin from the window's edge, for `standard`. */
const MODAL_MAX_WIDTH = 960;
const MODAL_MARGIN = 40;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Where the modal sits in a window's content area: `standard` is a centred card with a margin,
 * `fullscreen` the whole content area. The bar is the card's top strip; the page fills the rest.
 */
export const modalLayoutOf = (
    content: { width: number; height: number },
    display: SubWebViewDisplay
): { card: Rect; page: Rect } => {
    const card =
        display === 'fullscreen'
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
