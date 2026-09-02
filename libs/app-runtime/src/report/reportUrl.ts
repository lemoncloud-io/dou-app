/**
 * `api/reportUrl.ts`
 * - Strips query-string secrets out of a URL before it is copied into a report.
 *
 * A report payload used to carry `window.location.href` verbatim, and this app
 * puts capability material in query strings — OAuth callbacks, verify/reset
 * links, cloud addresses. That payload is stored in the report list, and an
 * issue report without attachments is relayed to a shared Slack channel on top
 * of that, so whatever rides in the query is stored and shared with it.
 *
 * `routeTrail` states the rule this file enforces for the report payload: path
 * segments are opaque resource ids the report already carries, query strings
 * are not.
 *
 * Values are masked wholesale rather than by key name. Which parameter holds
 * the secret depends on the link that produced it, so a deny-list of names is a
 * guess — and the diagnostic value is in WHICH parameters were present, which
 * survives masking intact. The fragment is dropped entirely: nothing here
 * routes on it, and it is where token-carrying auth flows put their secrets.
 */
import { REDACTED } from '@chatic/logger';

/**
 * Parameters kept at their real value.
 *
 * `code` is the invite/share code. It is capability material — `useRetireInvite`
 * calls it a credential and keeps it out of its own logs — but an invite that
 * failed cannot be traced without knowing which invite it was, and that trace is
 * the reason these reports exist. Deliberate exception, not an oversight: the
 * report is internal, and the alternative is an unactionable invite report.
 */
const PRESERVED_PARAMS = new Set(['code']);

/**
 * Masks the values in a query string, keeping the parameter names (and the
 * values of `PRESERVED_PARAMS`).
 *
 * @param search a query string with or without its leading `?`
 * @returns `?code=abc&state=[REDACTED]`, or an empty string when there are no params
 */
export const redactQueryString = (search: string): string => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    // Repeated keys collapse: `?a=…&a=…` masked twice says nothing the single
    // entry does not. A preserved key keeps its first value.
    const keys = [...new Set(params.keys())];
    if (!keys.length) return '';

    const rendered = keys.map(key =>
        PRESERVED_PARAMS.has(key) ? `${key}=${encodeURIComponent(params.get(key) ?? '')}` : `${key}=${REDACTED}`
    );
    return `?${rendered.join('&')}`;
};

/**
 * The URL as a report may carry it: path kept, query values masked, fragment
 * dropped.
 *
 * Deliberately built by cutting the original string rather than through `URL`,
 * so a relative href (or any scheme without a parseable origin) is handled by
 * the same path instead of falling into a catch that would have to guess.
 */
export const sanitizeReportUrl = (href: string): string => {
    const base = href.split(/[?#]/)[0];
    const queryAt = href.indexOf('?');
    if (queryAt === -1) return base;

    // Everything between `?` and the fragment; a `#` before the `?` means there
    // is no query at all (`split` above already dropped it).
    const hashAt = href.indexOf('#');
    if (hashAt !== -1 && hashAt < queryAt) return base;

    const search = hashAt === -1 ? href.slice(queryAt + 1) : href.slice(queryAt + 1, hashAt);
    return `${base}${redactQueryString(search)}`;
};
