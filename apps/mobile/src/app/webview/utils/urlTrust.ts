import { CUSTOM_SCHEMES, DEEP_LINK_DOMAINS } from '../../services/deeplinks/deeplinkUtils';

// Parsed by hand rather than with `URL`: React Native's `URL.origin` is a regex over the raw string
// that keeps userinfo, query and fragment, and Jest runs Node's WHATWG `URL` instead, so a check
// built on it would behave differently on device than in its tests. The userinfo group is dropped
// so `https://app.chatic.io@evil.example` reads as `evil.example`, which is where it actually goes.
const ORIGIN_PATTERN = /^(https?):\/\/(?:[^/?#@]*@)?([^/?#]+)/i;

const originOf = (url: string | undefined): string | null => {
    const match = url ? ORIGIN_PATTERN.exec(url) : null;
    return match ? `${match[1].toLowerCase()}://${match[2].toLowerCase()}` : null;
};

/**
 * Whether a page at `pageUrl` may drive the native bridge: it must be served by the origin the
 * WebView was pointed at (`baseUrl` — the release web, a debug override, or the custom-zip server),
 * or by one of the app's own web hosts, which a base URL may redirect to.
 *
 * A page the web navigated to on any other origin gets no access to native features such as
 * contacts, files or opening URLs. What `pageUrl` names depends on the WebView: the sending frame on
 * iOS and on current Android, but the top-level page on the old-Android fallback, where an iframe
 * inside a trusted page would pass.
 */
export const isTrustedBridgeUrl = (pageUrl: string | undefined, baseUrl: string): boolean => {
    const origin = originOf(pageUrl);
    if (!origin) return false;
    return origin === originOf(baseUrl) || DEEP_LINK_DOMAINS.some(host => origin === `https://${host}`);
};

// Both app schemes, not just this build's: the debug deeplink screen opens the other channel's
// scheme on purpose (to check it does not land in this build), and the web and native map a LOCAL
// stage to different schemes. Neither leaves the app family.
const OPENABLE_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel', 'sms', ...CUSTOM_SCHEMES];

/**
 * Whether the web may ask the OS to open `url`: web links, mail, phone, SMS and the app's own
 * schemes. Any other scheme could hand an intent or another app's custom scheme a payload the page
 * chose, so it is refused.
 */
export const isOpenableUrl = (url: unknown): boolean => {
    const scheme = typeof url === 'string' ? /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase() : undefined;
    return !!scheme && OPENABLE_SCHEMES.includes(scheme);
};
