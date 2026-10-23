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
 * finding along with the value. Tokens, numbers and addresses say a little more — a fingerprint,
 * the last four digits, a mail provider's domain (`fingerprint.ts`) — except to a `strict` caller.
 *
 * **What is deliberately NOT matched: opaque high-entropy strings.** A rule like "20+ random-looking
 * characters" would also eat ids, `cid`, `runId` and every uuid — the join axes the whole log system
 * exists to follow. Losing those is worse than the risk it would cover, and it fails silently: the
 * entry still looks well-formed with `[REDACTED]` where the id was.
 */

import {
    emailPlaceholder,
    foldDetailedPlaceholders,
    isShelfMark,
    phonePlaceholder,
    isDetailed,
    restoreShelved,
    shelveDetailedPlaceholders,
    tokenPlaceholder,
    type RedactOptions,
} from './fingerprint';
import { REDACTED } from './sensitiveKeys';

interface ValuePattern {
    pattern: RegExp;
    /** Whether to print the detailed form, then the match and its groups. */
    replace: (detailed: boolean, match: string, ...groups: string[]) => string;
}

/**
 * The header.payload.signature of a JWT in base64url. The `eyJ` prefix is `{"` encoded, so it marks a
 * JSON header specifically rather than any dotted token.
 */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/;

/**
 * An email address. The trailing `\.[A-Za-z]{2,}` is what keeps this off our composite ids:
 * `<channelId>@<userId>` has no dotted TLD after the `@`, so it is not mistaken for an address.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

/** Whether a whole value is a JWT — for the name-based rule, which sees the value on its own. */
export const isJwtShaped = (value: string): boolean => new RegExp(`^${JWT.source}$`).test(value);

/** Whether a whole value is an email address. */
export const isEmailShaped = (value: string): boolean => new RegExp(`^${EMAIL.source}$`).test(value);

const global = (pattern: RegExp, flags = 'g'): RegExp => new RegExp(pattern.source, flags);

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
 * Query parameters whose values are kept. Each one names a tenancy axis, a version, or a view state —
 * read off real entries, where these were the most often masked names and none of them ever held a
 * secret. `code` is absent on purpose: it is an OAuth authorization code or an invite code as often
 * as anything else.
 *
 * Matched exactly, case-insensitively, on the decoded name. A kept value still goes through the shape
 * rules below with the rest of the text, so an address that turns up in `type=` is masked anyway.
 */
export const SAFE_QUERY_PARAMS: ReadonlySet<string> = new Set([
    'cid',
    'sid',
    'v',
    'version',
    'provider',
    'tab',
    'page',
    'limit',
    'sort',
    'type',
    'view',
    'lang',
]);

/**
 * What a kept value may look like: an id, a version, a word. Anything else under a safe name — an
 * encoded `@`, a second `?`, a `;` — is masked like any other value, because the name alone does not
 * make `?cid=1?token=…` safe.
 */
const SAFE_QUERY_VALUE = /^[A-Za-z0-9._~-]{0,64}$/;

const decodeName = (raw: string): string => {
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
        return raw;
    }
};

/**
 * Masks the values in a query string, keeping the parameter names.
 *
 * **Names kept, values masked unless the name is on {@link SAFE_QUERY_PARAMS}.** Which parameter holds
 * the secret depends on the link that produced it, so a deny-list of parameter names is a guess — and
 * the diagnostic value is in WHICH parameters were present, which survives masking intact. That is the
 * same reasoning `report/reportUrl.ts` wrote down for report payloads, applied to every entry rather
 * than to reports alone. The safe list is the other direction: a `cid` or a `v`
 * masked in every url that carried one hid the axis the entry was read by.
 *
 * **Different from the report path in two places.** It keeps its own safe list, and it never keeps
 * `code`: `reportUrl` deliberately preserves `code` so an
 * invite that failed is still traceable, because a report is internal. Logs are not: they are
 * uploaded and broadly readable, and `useRetireInvite` already treats that code as a credential and
 * keeps it out of its own entries. So `code` is masked here.
 *
 * A kept value is written as it appeared, not re-encoded. A `strict` caller keeps no value at all —
 * the masking a sink outside the log pipeline always had.
 */
const maskQuery = (tail: string, strict: boolean): string => {
    const separator = tail[0];
    const body = tail.slice(1);
    if (!body) return tail;

    // A fragment is not reliably `key=value` — auth flows put bare tokens there — so it goes whole.
    if (separator === '#') return `#${REDACTED}`;

    const [search, fragment] = body.split('#');
    const pairs = new Set<string>();
    for (const pair of search.split('&')) {
        if (!pair) continue;
        const equals = pair.indexOf('=');
        const rawName = equals < 0 ? pair : pair.slice(0, equals);
        const name = decodeName(rawName);
        const value = equals < 0 ? '' : pair.slice(equals + 1);
        // A shelved placeholder is a value masked on an earlier pass (`cid=[PHONE#…]`); keeping it is
        // what makes the second pass give the first pass's text.
        const kept =
            !strict &&
            SAFE_QUERY_PARAMS.has(name.toLowerCase()) &&
            (SAFE_QUERY_VALUE.test(value) || isShelfMark(value));
        // Repeated names collapse: `?a=…&a=…` masked twice says nothing the single entry does not.
        pairs.add(kept ? `${name}=${value}` : `${name}=${REDACTED}`);
    }
    const masked = pairs.size ? `?${[...pairs].join('&')}` : '?';

    return fragment === undefined ? masked : `${masked}#${REDACTED}`;
};

/**
 * Applied in order, most specific first.
 *
 * `Bearer` runs after the JWT rule on purpose: a bearer JWT reads better as `Bearer [JWT]` (the
 * scheme survives, and the kind of credential is still named) and the rule below then covers bearer
 * values that are not JWTs.
 *
 * The token rules fingerprint the token itself — a bearer value without its scheme — so the same
 * token reads the same whether it was found in a header line or under a `token` key. An AWS access
 * key is a key, not a token, and stays bare.
 */
const VALUE_PATTERNS: readonly ValuePattern[] = [
    { pattern: global(JWT), replace: (detailed, match) => tokenPlaceholder('JWT', match, detailed) },
    {
        pattern: /\b(Bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
        replace: (detailed, _match, scheme, token) => `${scheme} ${tokenPlaceholder('TOKEN', token, detailed)}`,
    },
    // FCM/GCM registration tokens carry this literal marker between the instance id and the body.
    {
        pattern: /[A-Za-z0-9_-]{6,}:APA91b[A-Za-z0-9_-]{20,}/g,
        replace: (detailed, match) => tokenPlaceholder('TOKEN', match, detailed),
    },
    { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: () => '[TOKEN]' },
    { pattern: global(EMAIL), replace: (detailed, match) => emailPlaceholder(match, detailed) },
    // E.164, then the separated and bare domestic mobile forms. Anchored on a leading `0`/`+` so
    // epoch milliseconds and other long numerals are left alone.
    { pattern: /\+[1-9]\d{7,14}\b/g, replace: (detailed, match) => phonePlaceholder(match, detailed) },
    {
        pattern: /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g,
        replace: (detailed, match) => phonePlaceholder(match, detailed),
    },
    { pattern: /\b01[016789]\d{7,8}\b/g, replace: (detailed, match) => phonePlaceholder(match, detailed) },
];

/**
 * Masks recognisable secrets and personal data inside `text`.
 *
 * Query strings go first: masking a url's parameters removes whatever was hiding in them in one
 * step, and what is left of the url (scheme, host, path, parameter names) is the part worth reading.
 * The shape rules then run over the remainder — an `sms:` url, for instance, keeps its recipient in
 * the path, where the phone rule finds it.
 *
 * Masking twice gives the same text as masking once, which matters because an entry is masked again
 * each time it crosses into another shape: no placeholder matches a rule, and detailed ones are
 * shelved while the rules run. For a `strict` caller, detailed placeholders that arrived already
 * masked are folded back to bare instead.
 *
 * Returns the input unchanged when nothing matches, so a caller can compare identity to tell whether
 * anything was masked at all.
 */
export const redactText = (text: string, options?: RedactOptions): string => {
    const detailed = isDetailed(options);
    // Detailed placeholders already in the text are either kept out of the rules' way, or folded to
    // bare before anything runs for a strict caller.
    const { text: input, shelved } = detailed
        ? shelveDetailedPlaceholders(text)
        : { text: foldDetailedPlaceholders(text), shelved: [] };
    const withoutQueries = input.replace(
        URL_WITH_QUERY,
        (_match, head: string, tail: string) => head + maskQuery(tail, !!options?.strict)
    );

    const masked = VALUE_PATTERNS.reduce(
        (current, { pattern, replace }) =>
            current.replace(pattern, (match: string, ...groups: unknown[]) =>
                replace(detailed, match, ...(groups as string[]))
            ),
        withoutQueries
    );
    return restoreShelved(masked, shelved);
};
