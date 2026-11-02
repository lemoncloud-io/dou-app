/**
 * The domains whose subdomains a sub WebView may show: one subtree per backend, kept for pages the
 * app's own review pipeline deploys. A pattern rather than a list of origins, so a new page needs a
 * deploy, not an app release.
 *
 * Deliberately not `*.chatic.io`: that would take in the web app itself (`dou.chatic.io`, which in a
 * sub WebView boots a second app and shares the first one's storage by origin), the deep-link
 * domain the main WebView's bridge trusts (`app.chatic.io`), every internal tool, and any subdomain
 * created later — including one whose DNS record outlived its service and someone else now serves.
 */
export const SUB_WEBVIEW_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

// One DNS label and nothing else: no userinfo, no port, no path character in the host.
const HOST_PATTERN = /^https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.([a-z0-9.-]+)(?=[/?#]|$)/i;

// A backslash reads as `/` to Android's URL parser but not to the pattern above, so
// `https://evil.example\@x.apps.chatic.io` would pass here and load evil.example. Whitespace and
// control characters are refused for the same reason: parsers disagree on them.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\\\s\u0000-\u001f\u007f]/;

/**
 * Whether a sub WebView may show `url`: `https://<label>.<domain>` for one of `domains`, with a
 * single label — the domain itself is not a page. Anything a parser could read two ways is refused.
 */
export const isAllowedSubWebViewUrl = (url: unknown, domains: readonly string[] = SUB_WEBVIEW_DOMAINS): boolean => {
    if (typeof url !== 'string' || UNSAFE_CHARACTERS.test(url)) return false;
    const match = HOST_PATTERN.exec(url);
    if (!match) return false;
    return domains.includes(match[2].toLowerCase());
};
