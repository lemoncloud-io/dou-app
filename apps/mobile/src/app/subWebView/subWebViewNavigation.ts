import { isAllowedSubWebViewUrl } from '../services/subWebView/subWebViewAllowlist';

/** What the sub WebView does with a navigation: load it, hand it to the OS, or drop it. */
export type SubWebViewNavigationDecision = 'load' | 'external' | 'block';

// What the OS may open for a top-level navigation: the web, mail, phone, SMS and the app stores.
// No app schemes and no `intent:` — a page in the sub WebView must not drive the app's own routing
// from underneath the web that opened it, nor name an arbitrary Android component.
const EXTERNAL_SCHEMES: readonly string[] = ['https', 'http', 'mailto', 'tel', 'sms', 'itms-apps', 'market'];

// A frame reaches no host: iOS gives only the main frame a channel, and `SubWebView` drops any
// message whose origin is not the one the view was opened on. So any https or in-memory document may
// load; nothing a frame asks for is ever handed to the OS.
const FRAME_SCHEMES: readonly string[] = ['https', 'about', 'data', 'blob'];

// A web URL the OS could read differently from this check: userinfo before the host, a backslash
// (Android reads it as `/`), whitespace or a control character. Such a URL is not handed on at all.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const AMBIGUOUS_WEB_URL = /^https?:\/\/[^/?#]*@|[\\\s\u0000-\u001f\u007f]/i;

// The app's universal and App Link paths, matched on the host as the OS resolves it: any case, any
// port, a trailing dot. Loaded in the sub WebView they would show the invite bounce page, which then
// tries the app's own scheme; handed to the OS they would re-enter the app on Android. Either way
// they are the app's routing, which this page does not drive.
const DEEP_LINK_PATTERN = /^https?:\/\/app(?:-dev)?\.chatic\.io\.?(?::\d*)?\/(?:i|s)(?:[/?#]|$)/i;

const schemeOf = (url: string) => /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase();

/**
 * Decides a navigation the sub WebView is about to start, and what its `OpenURL` may open. A request
 * with no `isTopFrame` — Android reports none — is checked as a top-level one, the stricter of the two.
 */
export const decideSubWebViewNavigation = (request: {
    url: string;
    isTopFrame?: boolean;
}): SubWebViewNavigationDecision => {
    const { url } = request;
    const scheme = schemeOf(url);
    if (request.isTopFrame === false) return scheme && FRAME_SCHEMES.includes(scheme) ? 'load' : 'block';

    if (url === 'about:blank' || isAllowedSubWebViewUrl(url)) return 'load';
    if ((scheme === 'https' || scheme === 'http') && AMBIGUOUS_WEB_URL.test(url)) return 'block';
    if (DEEP_LINK_PATTERN.test(url)) return 'block';
    return scheme && EXTERNAL_SCHEMES.includes(scheme) ? 'external' : 'block';
};
