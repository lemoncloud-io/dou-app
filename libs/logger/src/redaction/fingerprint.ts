import { sha256, toHex, utf8Bytes } from './sha256';

/**
 * Fingerprints and partial display — what a masked value may still say about itself.
 *
 * A bare `[JWT]` hides the token and also the one fact a token problem is diagnosed from: was it the
 * same token as a minute ago, or a newly issued one? A fingerprint answers that without the value:
 * the first six hex characters of the token's SHA-256. Nothing about the token can be read back from
 * it, and the same token prints the same everywhere — in the web, in native code, on any device.
 *
 * **Only tokens get a fingerprint.** A token is long and random, so its hash cannot be reversed by
 * trying candidates. A phone number or an address is the opposite: with the last four digits shown, a
 * domestic number has ten thousand candidates left, and hashing each is instant. A salt only the
 * device knows would defend that, but a salt has to come from a cryptographic random source and the
 * app's runtime (React Native's Hermes) has none. So numbers and addresses get a partial display and
 * no fingerprint — `[PHONE:…5678]`, `[EMAIL:@gmail.com]` — and nothing here needs randomness.
 *
 * **`strict` prints the bare forms** (`[JWT]`, `[PHONE]`) and folds detailed ones that arrive from
 * elsewhere back to them. That is what keeps a sink outside the log pipeline (Crashlytics) receiving
 * exactly what it received before.
 */

/** Hex characters of the hash kept. Enough to tell two tokens apart in a run's logs. */
const FINGERPRINT_LENGTH = 6;

/** Per-call choices for the masking functions. */
export interface RedactOptions {
    /**
     * Bare placeholders only — no fingerprint, no partial display, and detailed placeholders already
     * in the text folded back to bare. For sinks outside the log pipeline, whose content is not
     * this pipeline's to widen.
     */
    strict?: boolean;
}

/** Whether a masking call prints the detailed forms: always, except for a strict caller. */
export const isDetailed = (options?: RedactOptions): boolean => !options?.strict;

const fingerprintOf = (value: string): string => toHex(sha256(utf8Bytes(value))).slice(0, FINGERPRINT_LENGTH);

/** The two token placeholders that carry a fingerprint. */
export type TokenPlaceholderKind = 'JWT' | 'TOKEN';

/**
 * Below this a value gets no fingerprint, wherever it was found. Every real token is far longer; a
 * short value is something else wearing the name or the scheme — `Bearer 12345678`, a code, a nonce —
 * and an unkeyed hash of a short value can be matched by trying candidates.
 */
export const MIN_FINGERPRINTED_TOKEN_LENGTH = 16;

/** `[JWT#3f9a1c]`, or `[JWT]` when not detailed or when the value is too short to fingerprint. */
export const tokenPlaceholder = (kind: TokenPlaceholderKind, value: string, detailed: boolean): string =>
    detailed && value.length >= MIN_FINGERPRINTED_TOKEN_LENGTH ? `[${kind}#${fingerprintOf(value)}]` : `[${kind}]`;

/**
 * `[PHONE:…5678]` — the last four digits, enough to answer "is this the number?" in a support case,
 * and never more: the axis that finds a person is still `uid`.
 */
export const phonePlaceholder = (value: string, detailed: boolean): string =>
    detailed ? `[PHONE:…${value.replace(/\D/g, '').slice(-4)}]` : '[PHONE]';

/**
 * Mail providers whose domain an address may show. A provider's domain says which service a delivery
 * problem is about and nothing about the person; a personal or company domain (`@jane-doe.com`,
 * `@lemoncloud.io`) can name its owner nearly as well as the local part, so it is hidden too. Exact
 * names only — a subdomain of one of these is not on the list.
 */
export const COMMON_MAIL_DOMAINS: ReadonlySet<string> = new Set([
    'gmail.com',
    'googlemail.com',
    'naver.com',
    'kakao.com',
    'daum.net',
    'hanmail.net',
    'nate.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'yahoo.com',
    'yahoo.co.kr',
]);

/**
 * `[EMAIL:@gmail.com]` for a common mail provider ({@link COMMON_MAIL_DOMAINS}), `[EMAIL]` for any
 * other domain. The local part is never shown: it is the person.
 */
export const emailPlaceholder = (value: string, detailed: boolean): string => {
    const domain = value.slice(value.lastIndexOf('@') + 1).toLowerCase();
    return detailed && COMMON_MAIL_DOMAINS.has(domain) ? `[EMAIL:@${domain}]` : '[EMAIL]';
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MAIL_DOMAINS = [...COMMON_MAIL_DOMAINS].map(escapeRegExp).join('|');

/**
 * The exact detailed forms the builders above print — a token's fingerprint, a number's last four
 * digits, a listed provider's domain. Exact, because whatever matches is let through untouched
 * (shelved, or kept under a sensitive name): a looser pattern would let `[EMAIL:jane@gmail.com]` carry
 * an address past masking.
 */
const DETAIL = `(?:(JWT|TOKEN)#[0-9a-f]{6}|(PHONE):…\\d{4}|(EMAIL):@(?:${MAIL_DOMAINS}))`;

/** A detailed placeholder, with its kind captured. Only these four ever carry detail. */
const DETAILED_PLACEHOLDER = new RegExp(`\\[${DETAIL}\\]`, 'g');

const kindOf = (...groups: (string | undefined)[]): string => groups.find(Boolean) ?? '';

const PLACEHOLDER_VALUE = new RegExp(`^\\[(?:(REDACTED)|(JWT|TOKEN|PHONE|EMAIL)|${DETAIL})\\]$`);

/**
 * The kind of a whole value that is already a placeholder — masked by an earlier layer — such as
 * `EMAIL` for `[EMAIL:@gmail.com]`; `undefined` for anything else.
 */
export const placeholderKindOf = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const match = PLACEHOLDER_VALUE.exec(value);
    return match ? kindOf(...match.slice(1)) : undefined;
};

/**
 * Folds detailed placeholders back to bare ones. A value masked in detail by one layer (the HTTP
 * logger masks request bodies when it writes the entry) can reach a strict sink later, and strict
 * has to mean the same output whichever layer masked first.
 */
export const foldDetailedPlaceholders = (text: string): string =>
    text.includes('[')
        ? text.replace(
              DETAILED_PLACEHOLDER,
              (_match, ...groups: (string | undefined)[]) => `[${kindOf(...groups.slice(0, 3))}]`
          )
        : text;

/** A detailed placeholder cut off at the end of a text, its `]` missing. */
const CUT_DETAILED_PLACEHOLDER = /\[(?:JWT|TOKEN|PHONE|EMAIL)[#:][^\]\s]*$/;

/**
 * `text` without a detailed placeholder its end cuts through. A cut placeholder matches nothing that
 * folds or shelves it, so a strict reader would get its pieces — `[EMAIL:@gmail.co`, or two of a
 * number's four digits — instead of the bare form. Used where a body is cut to a length.
 */
export const withoutCutPlaceholder = (text: string): string => text.replace(CUT_DETAILED_PLACEHOLDER, '');

/** Stands in for a shelved placeholder: a private-use character no rule matches, around its index. */
const SHELF_MARK = '\uE000';
const SHELVED = new RegExp(`${SHELF_MARK}(\\d+)${SHELF_MARK}`, 'g');

/**
 * Takes detailed placeholders out of `text` while the rules run, and {@link restoreShelved} puts them
 * back. Without this, masking an already masked text again would break them: the `#` in
 * `[JWT#3f9a1c]` reads as a url fragment to the query rule (`token:[JWT#3f9a1c]` looks like a
 * scheme-and-fragment), the `:` in `[PHONE:…5678]` as a scheme, and an entry is masked again each time
 * it crosses into another shape.
 */
export const shelveDetailedPlaceholders = (text: string): { text: string; shelved: string[] } => {
    const shelved: string[] = [];
    // A text that already holds the mark is left whole: restoring would rewrite the marks it had.
    // Masking it again may then split a placeholder, but nothing it hid comes back.
    if (!text.includes('[') || text.includes(SHELF_MARK)) return { text, shelved };
    const replaced = text.replace(DETAILED_PLACEHOLDER, placeholder => {
        shelved.push(placeholder);
        return `${SHELF_MARK}${shelved.length - 1}${SHELF_MARK}`;
    });
    return { text: replaced, shelved };
};

/** Whether a whole value is one shelved placeholder — kept wherever the placeholder would be. */
export const isShelfMark = (value: string): boolean => new RegExp(`^${SHELF_MARK}\\d+${SHELF_MARK}$`).test(value);

export const restoreShelved = (text: string, shelved: readonly string[]): string =>
    shelved.length ? text.replace(SHELVED, (mark, index: string) => shelved[Number(index)] ?? mark) : text;
