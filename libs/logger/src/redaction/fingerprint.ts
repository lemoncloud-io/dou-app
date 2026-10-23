import { hmacSha256Hex, toHex } from './hmacSha256';

/**
 * Fingerprints and partial display — what a masked value may still say about itself.
 *
 * A bare `[JWT]` hides the token and also the one fact a token problem is diagnosed from: was it the
 * same token as a minute ago, or a newly issued one? A fingerprint answers that without the value.
 * It is the first six hex characters of `HMAC-SHA256(salt, value)`, so the same value reads the same
 * on one device, and nothing about the value can be read back from it.
 *
 * **The salt belongs to the device.** Each install draws its own and keeps it; in the app the native
 * side issues it and hands it to the WebView, so both runtimes print the same fingerprint for the same
 * value. Across devices the same value prints differently, and that is the point: a salt shared by
 * every client would ship inside every client, and with it anyone holding the logs could hash every
 * phone number there is and read the fingerprints back. **The salt never leaves the device** — no
 * entry, field or statistic carries it.
 *
 * **No salt, no detail.** Until a host sets one — and whenever a caller asks for `strict` output —
 * every placeholder is the bare form it has always been (`[JWT]`, `[PHONE]`), and detailed ones that
 * arrive from elsewhere are folded back to it. That is what keeps a sink outside the log pipeline
 * (Crashlytics) receiving exactly what it received before.
 */

/** A shorter salt is refused: it is the only thing standing between a fingerprint and a guess. */
export const MIN_REDACTION_SALT_LENGTH = 16;

/** Hex characters of the HMAC kept. Enough to tell two tokens apart in one device's logs. */
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

let salt: string | undefined;

/**
 * Sets the device's salt. Call once at boot, before anything is serialized. A value shorter than
 * {@link MIN_REDACTION_SALT_LENGTH} — or `undefined` — leaves masking in its bare form.
 */
export const setRedactionSalt = (value: string | undefined): void => {
    salt = typeof value === 'string' && value.length >= MIN_REDACTION_SALT_LENGTH ? value : undefined;
};

interface CryptoLike {
    getRandomValues?: (array: Uint8Array) => Uint8Array;
}

/**
 * A new random salt, for a host that has none stored yet — or `undefined` where the runtime has no
 * cryptographic random source, and then the host keeps masking bare.
 *
 * **Never `Math.random`.** Entry ids fall back to it where `crypto` is missing (React Native's Hermes),
 * and those ids are uploaded with every entry. A generator's state can be recovered from its outputs,
 * and with a salt drawn from the same generator, every masked phone number — four hidden digits, ten
 * thousand candidates — could be read back. A host with no salt loses the detail; a host with a weak
 * salt loses the numbers.
 */
export const createRedactionSalt = (): string | undefined => {
    const cryptoLike = (globalThis as { crypto?: CryptoLike }).crypto;
    if (typeof cryptoLike?.getRandomValues !== 'function') return undefined;
    try {
        const bytes = new Uint8Array(16);
        cryptoLike.getRandomValues(bytes);
        return toHex(bytes);
    } catch {
        return undefined;
    }
};

/** The salt a masking call should use: none when the caller asked for strict output. */
export const redactionSaltFor = (options?: RedactOptions): string | undefined => (options?.strict ? undefined : salt);

const fingerprintOf = (value: string, key: string): string => hmacSha256Hex(key, value).slice(0, FINGERPRINT_LENGTH);

/** The two token placeholders that can carry a fingerprint. */
export type TokenPlaceholderKind = 'JWT' | 'TOKEN';

/** `[JWT#3f9a1c]`, or `[JWT]` without a salt. */
export const tokenPlaceholder = (kind: TokenPlaceholderKind, value: string, key: string | undefined): string =>
    key ? `[${kind}#${fingerprintOf(value, key)}]` : `[${kind}]`;

/**
 * `[PHONE#a1b2c3:…5678]` — the last four digits, enough to answer "is this the number?" in a support
 * case, and never more: the axis that finds a person is still `uid`.
 *
 * The fingerprint is over the digits alone, so `010-1234-5678` and `01012345678` match. A number
 * written as `+82 10…` keeps its country code and does not match its domestic form.
 */
export const phonePlaceholder = (value: string, key: string | undefined): string => {
    if (!key) return '[PHONE]';
    const digits = value.replace(/\D/g, '');
    return `[PHONE#${fingerprintOf(digits, key)}:…${digits.slice(-4)}]`;
};

/**
 * `[EMAIL#9d0e11:@gmail.com]` — the domain only. The local part is the person; the domain is the
 * provider, which is what a delivery problem is about.
 *
 * Lower-cased before hashing, because mail providers treat the address case-insensitively and a
 * fingerprint that split on case would call one address two.
 */
export const emailPlaceholder = (value: string, key: string | undefined): string => {
    if (!key) return '[EMAIL]';
    const address = value.toLowerCase();
    return `[EMAIL#${fingerprintOf(address, key)}:@${address.slice(address.lastIndexOf('@') + 1)}]`;
};

/**
 * The exact detailed forms the builders above print — a token's fingerprint alone, a number's last
 * four digits, an address's domain. Exact, because whatever matches is let through untouched (shelved,
 * or kept under a sensitive name): a looser pattern would let `[EMAIL#abcdef:jane@gmail.com]` carry
 * an address past masking.
 */
const DETAIL =
    '(?:(JWT|TOKEN)#[0-9a-f]{6}|(PHONE)#[0-9a-f]{6}:…\\d{4}|(EMAIL)#[0-9a-f]{6}:@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,})';

/** A detailed placeholder, with its kind captured. Only these four ever carry detail. */
const DETAILED_PLACEHOLDER = new RegExp(`\\[${DETAIL}\\]`, 'g');

const kindOf = (...groups: (string | undefined)[]): string => groups.find(Boolean) ?? '';

const PLACEHOLDER_VALUE = new RegExp(`^\\[(?:(REDACTED)|(JWT|TOKEN|PHONE|EMAIL)|${DETAIL})\\]$`);

/**
 * The kind of a whole value that is already a placeholder — masked by an earlier layer — such as
 * `EMAIL` for `[EMAIL#9d0e11:@gmail.com]`; `undefined` for anything else.
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
    text.includes('#')
        ? text.replace(
              DETAILED_PLACEHOLDER,
              (_match, ...groups: (string | undefined)[]) => `[${kindOf(...groups.slice(0, 3))}]`
          )
        : text;

/** Stands in for a shelved placeholder: a private-use character no rule matches, around its index. */
const SHELF_MARK = '\uE000';
const SHELVED = new RegExp(`${SHELF_MARK}(\\d+)${SHELF_MARK}`, 'g');

/**
 * Takes detailed placeholders out of `text` while the rules run, and {@link restoreShelved} puts them
 * back. Without this, masking an already masked text again would break them: the `#` in
 * `[JWT#3f9a1c]` reads as a url fragment to the query rule (`token:[JWT#3f9a1c]` looks like a
 * scheme-and-fragment), and an entry is masked again each time it crosses into another shape.
 */
export const shelveDetailedPlaceholders = (text: string): { text: string; shelved: string[] } => {
    const shelved: string[] = [];
    // A text that already holds the mark is left whole: restoring would rewrite the marks it had.
    // Masking it again may then split a placeholder, but nothing it hid comes back.
    if (!text.includes('#') || text.includes(SHELF_MARK)) return { text, shelved };
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
