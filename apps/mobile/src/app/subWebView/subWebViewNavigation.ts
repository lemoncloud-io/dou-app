import { isAllowedSubWebViewUrl } from '../services/subWebView/subWebViewAllowlist';

/** What the sub WebView does with a navigation: load it, hand it to the OS, or drop it. */
export type SubWebViewNavigationDecision = 'load' | 'external' | 'block';

// What the OS may open for a top-level navigation: the web, mail, phone, SMS and the app stores.
// No app schemes and no `intent:` — a page in the sub WebView must not drive the app's own routing
// from underneath the web that opened it, nor name an arbitrary Android component.
const EXTERNAL_SCHEMES: readonly string[] = ['https', 'http', 'mailto', 'tel', 'sms', 'itms-apps', 'market'];

// Inside a frame there is no bridge to reach, so any https or in-memory document may load; nothing
// a frame asks for is ever handed to the OS.
const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

// The app's universal and App Link paths. Loaded in the sub WebView they would show the invite
// bounce page, which then tries the app's own scheme; handed to the OS they would re-enter the app
// on Android. Either way they are the app's routing, which this page does not drive.
const DEEP_LINK_PATTERN = /^https:\/\/app(?:-dev)?\.chatic\.io\/(?:i|s)(?:[/?#]|$)/i;

const schemeOf = (url: string) => /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();

/**
 * Decides a navigation the sub WebView is about to start. A request with no `isTopFrame` — Android
 * reports none — is checked as a top-level one, the stricter of the two.
 */
export const decideSubWebViewNavigation = (request: {
    url: string;
    isTopFrame?: boolean;
}): SubWebViewNavigationDecision => {
    const { url } = request;
    const scheme = schemeOf(url);
    if (request.isTopFrame === false) return scheme && FRAME_SCHEMES.includes(scheme) ? 'load' : 'block';

    if (url === 'about:blank' || isAllowedSubWebViewUrl(url)) return 'load';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return scheme && EXTERNAL_SCHEMES.includes(scheme) ? 'external' : 'block';
};
