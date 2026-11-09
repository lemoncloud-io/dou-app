/**
 * Which URLs a sub WebView may open at all, and how far the shell trusts each one. Both shells and
 * both webs ask this one module, so a link the web lets an owner save is a link the shell will open,
 * and the security boundary is drawn once.
 *
 * Three tiers:
 * - `firstParty` — the hub, `https://apps.chatic.io` and `https://apps-dev.chatic.io`, by exact
 *   origin. It is built and deployed by the DoU team, and is the only page told whether the user
 *   owns the cloud.
 * - `reviewed` — one label under those domains, the subtree the app's review pipeline deploys. The
 *   same test the mobile shell's allow-list has always applied.
 * - `external` — any other https site, which a cloud owner chose. Opened with the basic features
 *   only: no manifest is fetched from it, nothing it declares is applied, and the shell shows its
 *   host in the bar so it cannot pass itself off as DoU.
 *
 * Not `*.chatic.io` as first party: that would take in the web app itself, the deep-link domain the
 * main WebView's bridge trusts, and any subdomain created later.
 *
 * No imports, on purpose: the desktop shell's main bundle aliases this one file rather than the
 * whole of `@chatic/shared`. Parsed by hand rather than with `URL`, for the reason `subWebViewLink`
 * gives — React Native's `URL` and Node's read userinfo and `search` differently.
 */

/** How far the shell trusts a page; `null` from {@link subWebViewTrustOf} means it does not open it. */
export type SubWebViewTrust = 'firstParty' | 'reviewed' | 'external';

/** The hub's origins, one per stage. Only an exact match is first party. */
export const SUB_WEBVIEW_FIRST_PARTY_ORIGINS: readonly string[] = [
    'https://apps.chatic.io',
    'https://apps-dev.chatic.io',
];

/** The domains whose one-label subdomains are reviewed pages. */
export const SUB_WEBVIEW_REVIEWED_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

// One or more DNS labels joined by dots, with at least one dot, then the end of the host. No
// userinfo, no port, no percent-encoding and no trailing dot can sit in it, because none of `@`,
// `:`, `%` or a dot before the end is a label character.
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HTTPS_HOST = new RegExp(`^https://(${LABEL}(?:\\.${LABEL})+)(?=[/?#]|$)`, 'i');

// A backslash reads as `/` to some URL parsers (Android's, Chromium's) but not to the pattern above,
// so `https://evil.example\@x.apps.chatic.io` would read one host here and load another. Whitespace
// and control characters are refused for the same reason: parsers disagree on them.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\\\s\u0000-\u001f\u007f]/;

// A host whose last label is all digits is an IPv4 literal in some spelling (`127.1`, `10.0.0.1`).
// Chromium rewrites those (`127.1` loads as `127.0.0.1`), so the host read here would not be the
// origin the view ends up on; and no top-level domain is numeric, so no real site is lost. A
// hex label (`0x7f`) never ends a host for the same reason — the last label is always a TLD.
const NUMERIC_LAST_LABEL = /(?:^|\.)(?:\d+|0x[0-9a-f]*)$/i;

const hostOf = (url: unknown): string | null => {
    if (typeof url !== 'string' || UNSAFE_CHARACTERS.test(url)) return null;
    const host = HTTPS_HOST.exec(url)?.[1].toLowerCase();
    return host && !NUMERIC_LAST_LABEL.test(host) ? host : null;
};

/** Whether a sub WebView may open `url`: https, a plain host, and nothing a parser could read two ways. */
export const isOpenableSubWebViewUrl = (url: unknown): url is string => hostOf(url) !== null;

/** The lower-case origin of an openable `url` (`https://<host>`), or `null`. */
export const subWebViewOriginOf = (url: unknown): string | null => {
    const host = hostOf(url);
    return host ? `https://${host}` : null;
};

/** The tier of `url`, or `null` when a sub WebView does not open it. */
export const subWebViewTrustOf = (url: unknown): SubWebViewTrust | null => {
    const host = hostOf(url);
    if (!host) return null;
    if (SUB_WEBVIEW_FIRST_PARTY_ORIGINS.includes(`https://${host}`)) return 'firstParty';
    const dot = host.indexOf('.');
    return SUB_WEBVIEW_REVIEWED_DOMAINS.includes(host.slice(dot + 1)) ? 'reviewed' : 'external';
};
