/**
 * Masking by the shape of a value, not by the name of the field holding it.
 *
 * The key-based list next door only sees names, so it cannot help with the two places a secret most
 * often ends up: a free-form `message`, and a string whose key says nothing (`detail`, `reason`, the
 * text a server chose). Both go to the collector, so both need a second axis.
 *
 * **This is a safety net, not a licence.** The catalog's rule stands — the caller does not put
 * credentials or personal data in an entry. These patterns catch what slips past that rule, and they
 * only catch what is *recognisable*: a value in an unusual shape still gets through. Anything that
 * relies on this to be safe is one odd format away from shipping cleartext.
 *
 * **Each match gets its own placeholder.** `[EMAIL]` rather than a blanket `[REDACTED]`, because
 * "an address was here" is itself the diagnosis — collapsing every kind to one word deletes the
 * finding along with the value.
 *
 * **What is deliberately NOT matched: opaque high-entropy strings.** A rule like "20+ random-looking
 * characters" would also eat ids, `cid`, `runId` and every uuid — the join axes the whole log system
 * exists to follow. Losing those is worse than the risk it would cover, and it fails silently: the
 * entry still looks well-formed with `[REDACTED]` where the id was.
 */

import { REDACTED } from './sensitiveKeys';

interface ValuePattern {
    pattern: RegExp;
    replacement: string;
}

/**
 * A url-ish token that carries a query and/or a fragment.
 *
 * Three forms, because all three appear in entries today: an absolute url
 * (`https://host/path?…`, the WebView's own location), a scheme with an opaque body
 * (`sms:01012345678?body=…`, `chatic://…`), and a bare path (`/invite/accept?…`). The capturing
 * group is everything before the `?`/`#`, which is kept.
 *
 * Bounded by whitespace and quote/brace characters so it stops at the end of the url inside a
 * sentence, and it requires a `?` or `#` — a url with neither has nothing to mask here.
 */
const URL_WITH_QUERY =
    /((?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>{}?#]*|[a-zA-Z][a-zA-Z0-9+.-]*:[^\s"'<>{}/?#]+|\/[^\s"'<>{}?#]*))([?#][^\s"'<>{}]*)/g;

/**
 * Masks the values in a query string, keeping the parameter names.
 *
 * **Names kept, values masked wholesale.** Which parameter holds the secret depends on the link
 * that produced it, so a deny-list of parameter names is a guess — and the diagnostic value is in
 * WHICH parameters were present, which survives masking intact. That is the same reasoning
 * `report/reportUrl.ts` wrote down for report payloads; this is the same policy applied to every
 * entry rather than to reports alone.
 *
 * **Stricter than the report path in one place.** `reportUrl` deliberately preserves `code` so an
 * invite that failed is still traceable, because a report is internal. Logs are not: they are
 * uploaded and broadly readable, and `useRetireInvite` already treats that code as a credential and
 * keeps it out of its own entries. So nothing is preserved here.
 */
const maskQuery = (tail: string): string => {
    const separator = tail[0];
    const body = tail.slice(1);
    if (!body) return tail;

    // A fragment is not reliably `key=value` — auth flows put bare tokens there — so it goes whole.
    if (separator === '#') return `#${REDACTED}`;

    const [search, fragment] = body.split('#');
    const names = [...new Set(new URLSearchParams(search).keys())];
    // Repeated names collapse: `?a=…&a=…` masked twice says nothing the single entry does not.
    const masked = names.length ? `?${names.map(name => `${name}=${REDACTED}`).join('&')}` : '?';

    return fragment === undefined ? masked : `${masked}#${REDACTED}`;
};

/**
 * Applied in order, most specific first.
 *
 * `Bearer` runs after the JWT rule on purpose: a bearer JWT reads better as `Bearer [JWT]` (the
 * scheme survives, and the kind of credential is still named) and the rule below then covers bearer
 * values that are not JWTs.
 */
const VALUE_PATTERNS: readonly ValuePattern[] = [
    // header.payload.signature in base64url. The `eyJ` prefix is `{"` encoded, so it marks a JSON
    // header specifically rather than any dotted token.
    { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, replacement: '[JWT]' },
    { pattern: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: '$1 [TOKEN]' },
    // FCM/GCM registration tokens carry this literal marker between the instance id and the body.
    { pattern: /[A-Za-z0-9_-]{6,}:APA91b[A-Za-z0-9_-]{20,}/g, replacement: '[TOKEN]' },
    { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: '[TOKEN]' },
    // The trailing `\.[A-Za-z]{2,}` is what keeps this off our composite ids: `<channelId>@<userId>`
    // has no dotted TLD after the `@`, so it is not mistaken for an address.
    { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, replacement: '[EMAIL]' },
    // E.164, then the separated and bare domestic mobile forms. Anchored on a leading `0`/`+` so
    // epoch milliseconds and other long numerals are left alone.
    { pattern: /\+[1-9]\d{7,14}\b/g, replacement: '[PHONE]' },
    { pattern: /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, replacement: '[PHONE]' },
    { pattern: /\b01[016789]\d{7,8}\b/g, replacement: '[PHONE]' },
];

/**
 * Masks recognisable secrets and personal data inside `text`.
 *
 * Query strings go first: masking a url's parameters removes whatever was hiding in them in one
 * step, and what is left of the url (scheme, host, path, parameter names) is the part worth reading.
 * The shape rules then run over the remainder — an `sms:` url, for instance, keeps its recipient in
 * the path, where the phone rule finds it.
 *
 * Returns the input unchanged when nothing matches, so a caller can compare identity to tell whether
 * anything was masked at all.
 */
export const redactText = (text: string): string => {
    const withoutQueries = text.replace(URL_WITH_QUERY, (_match, head: string, tail: string) => head + maskQuery(tail));

    return VALUE_PATTERNS.reduce(
        (current, { pattern, replacement }) => current.replace(pattern, replacement),
        withoutQueries
    );
};
