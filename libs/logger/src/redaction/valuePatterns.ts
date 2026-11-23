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
    replace: (detailed: boolean, match: string, ...groups: string[]) => string;
}

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;

export const isJwtShaped = (value: string): boolean => new RegExp(`^${JWT.source}$`).test(value);

export const isEmailShaped = (value: string): boolean => new RegExp(`^${EMAIL.source}$`).test(value);

const global = (pattern: RegExp, flags = 'g'): RegExp => new RegExp(pattern.source, flags);

const URL_WITH_QUERY =
    /((?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>{}?#]*|[a-zA-Z][a-zA-Z0-9+.-]*:[^\s"'<>{}/?#]+|\/[^\s"'<>{}?#]*))([?#][^\s"'<>{}]*)/g;

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

const SAFE_QUERY_VALUE = /^[A-Za-z0-9._~-]{0,64}$/;

const decodeName = (raw: string): string => {
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
        return raw;
    }
};

const maskQuery = (tail: string, strict: boolean): string => {
    const separator = tail[0];
    const body = tail.slice(1);
    if (!body) return tail;

    if (separator === '#') return `#${REDACTED}`;

    const [search, fragment] = body.split('#');
    const pairs = new Set<string>();
    for (const pair of search.split('&')) {
        if (!pair) continue;
        const equals = pair.indexOf('=');
        const rawName = equals < 0 ? pair : pair.slice(0, equals);
        const name = decodeName(rawName);
        const value = equals < 0 ? '' : pair.slice(equals + 1);
        const kept =
            !strict &&
            SAFE_QUERY_PARAMS.has(name.toLowerCase()) &&
            (SAFE_QUERY_VALUE.test(value) || isShelfMark(value));
        pairs.add(kept ? `${name}=${value}` : `${name}=${REDACTED}`);
    }
    const masked = pairs.size ? `?${[...pairs].join('&')}` : '?';

    return fragment === undefined ? masked : `${masked}#${REDACTED}`;
};

const VALUE_PATTERNS: readonly ValuePattern[] = [
    { pattern: global(JWT), replace: (detailed, match) => tokenPlaceholder('JWT', match, detailed) },
    {
        pattern: /\b(Bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
        replace: (detailed, _match, scheme, token) => `${scheme} ${tokenPlaceholder('TOKEN', token, detailed)}`,
    },
    {
        pattern: /[A-Za-z0-9_-]{6,}:APA91b[A-Za-z0-9_-]{20,}/g,
        replace: (detailed, match) => tokenPlaceholder('TOKEN', match, detailed),
    },
    { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: () => '[TOKEN]' },
    { pattern: global(EMAIL), replace: (detailed, match) => emailPlaceholder(match, detailed) },
    { pattern: /\+[1-9]\d{7,14}\b/g, replace: (detailed, match) => phonePlaceholder(match, detailed) },
    {
        pattern: /\b0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}\b/g,
        replace: (detailed, match) => phonePlaceholder(match, detailed),
    },
    { pattern: /\b01[016789]\d{7,8}\b/g, replace: (detailed, match) => phonePlaceholder(match, detailed) },
];

export const redactText = (text: string, options?: RedactOptions): string => {
    const detailed = isDetailed(options);
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
