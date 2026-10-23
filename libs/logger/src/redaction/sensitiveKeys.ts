import type { RedactOptions } from './fingerprint';

/**
 * Field names whose values are masked before a log entry is persisted or sent
 * across the native bridge. Matched case-insensitively (substring) so
 * `Authorization`, `identityToken`, `x-amz-security-token`, etc. are covered.
 * Extend this list when new secret-bearing fields appear.
 */
export const SENSITIVE_KEYS = [
    'password',
    'token',
    'identitytoken',
    'accesstoken',
    'refreshtoken',
    'credential',
    'credentials',
    'accesskey',
    'accesskeyid',
    'secretkey',
    'secretaccesskey',
    'sessiontoken',
    'signature',
    'authorization',
    // Substring matching means 'token' already covers most bearer fields, but
    // these do not contain it and were reaching the wire in cleartext:
    // the identity JWT header, and the auth flows' own secrets.
    'x-lemon-identity',
    'xlemonidentity',
    'pwd',
    'otp',
    // One-time codes and the alias they are sent against: a rejected
    // verify-alias call logs the request body, which would otherwise ship a
    // still-valid reset code plus the account's email.
    'code',
    'alias',
    'secret',
    // The catalog's forbidden-content list, as names. Nothing in the tree logs these today — that is
    // the point: the caller's own rule is the first defence, and these are here for the call site
    // that has not been written yet. Only names with no diagnostic homonym are listed, which is why
    // `body`, `text`, `content` and `name` are absent: they would take `requestBody`, `statusText`,
    // `contentType` and `tagName` with them, and the transport's own entries depend on the first two.
    'email',
    'phone',
    'receipt',
    'messagebody',
    'pushbody',
    'pushtitle',
    'notificationbody',
    'notificationtitle',
];

/**
 * Names that contain one of the substrings above but hold no secret.
 *
 * Substring matching is the right default — a new `sessionToken2` is masked without anyone
 * remembering to list it — but it is indiscriminate, and over-masking is the failure mode that hides
 * best. Under-masking eventually gets noticed because a secret is visible; over-masking leaves a
 * well-formed entry with `[REDACTED]` exactly where the answer was, and nothing anywhere says a
 * field was lost.
 *
 * `code` is the whole problem: it has to stay on the list (it is the one-time verification code) and
 * it matches `errorCode`, `statusCode`, `countryCode` — the fields a failure is actually diagnosed
 * from. Every entry that carried one was shipping `[REDACTED]` in its place.
 *
 * Matched as an exact name or a suffix, so `httpStatusCode` is covered by `statuscode` without
 * listing it. Suffix rather than substring: the tail is what names the *kind* of value.
 */
export const SAFE_KEYS = [
    'errorcode',
    'statuscode',
    'httpcode',
    'resultcode',
    'reasoncode',
    'closecode',
    'responsecode',
    // Holds no `code`, so nothing masks it today; listed so a future sensitive name cannot take it.
    'httpstatus',
    'countrycode',
    'langcode',
    'languagecode',
    'localecode',
    'currencycode',
    'postalcode',
    'zipcode',
    'areacode',
    'codeversion',
    'codelength',
    // Verification state and format are not the address or the number they describe.
    'emailverified',
    'phoneverified',
    'phonetype',
    'receiptstatus',
];

/**
 * Safe names added for the log pipeline's own readers. A `strict` caller — a sink outside the
 * pipeline, which keeps the masking it always had — still masks them.
 */
const PIPELINE_ONLY_SAFE_KEYS = ['responsecode', 'httpstatus'];

/** Placeholder written in place of a masked value. */
export const REDACTED = '[REDACTED]';

const lower = (key: string): string => key.toLowerCase();

/** Whether a name is a known non-secret despite matching {@link SENSITIVE_KEYS}. */
const isSafeKey = (key: string, options?: RedactOptions): boolean => {
    const lowered = lower(key);
    return SAFE_KEYS.some(
        safe =>
            (lowered === safe || lowered.endsWith(safe)) && !(options?.strict && PIPELINE_ONLY_SAFE_KEYS.includes(safe))
    );
};

/**
 * Whether a field is a presence flag — `hasToken`, `isCredentialed`, `hasPassword`.
 *
 * These exist *because* the value must not be logged: a caller that wanted to say "a token was
 * present" without shipping the token wrote a boolean instead. Masking it takes away the thing that
 * was bought by not logging the secret, and leaves the entry looking as if it had held one.
 *
 * The boolean check is the guard. A `hasToken` holding a string is not a presence flag whatever it
 * is called, so it stays masked.
 */
const isPresenceFlag = (key: string, value: unknown): boolean =>
    typeof value === 'boolean' && /^(?:has|is|are|was|were|can|should|allows?|needs?)[A-Z_]/.test(key);

/** Whether a field name looks secret-bearing (case-insensitive substring match). */
export const isSensitiveKey = (key: string, options?: RedactOptions): boolean => {
    if (isSafeKey(key, options)) return false;
    const lowered = lower(key);
    return SENSITIVE_KEYS.some(sensitive => lowered.includes(sensitive));
};

/**
 * The name-based verdict, with the value in hand.
 *
 * Prefer this wherever the value is available: it is the only form that can tell a presence flag
 * from the secret it stands in for. {@link isSensitiveKey} remains for callers that hold a name
 * alone.
 */
export const isSensitiveField = (key: string, value: unknown, options?: RedactOptions): boolean =>
    !isPresenceFlag(key, value) && isSensitiveKey(key, options);

/**
 * Which kind of value a sensitive name holds, when that kind may keep a fingerprint or a partial
 * display rather than going whole.
 *
 * - `token` — a name whose every sensitive match is a token name (`deviceToken`, `identityToken`,
 *   `delegationToken`). A token is a key to an account, so it never shows its value; but whether it is
 *   the same token as before is what a token problem is diagnosed from, and a fingerprint says that.
 * - `email` / `phone` — the address or number, shown in part.
 *
 * **Every** match has to agree. `passwordResetToken` matches `token` and `password`, and a reset token
 * is a one-time code; `emailCode` is a verification code. Passwords, one-time codes, secrets and keys
 * keep no fingerprint at all — they are short enough that, given the salt, a fingerprint could be
 * matched by trying every candidate. `undefined` for those, and for any name that is not sensitive.
 */
export type SensitiveFamily = 'token' | 'email' | 'phone';

export const sensitiveFamilyOf = (key: string): SensitiveFamily | undefined => {
    if (isSafeKey(key)) return undefined;
    const lowered = lower(key);
    const matched = SENSITIVE_KEYS.filter(sensitive => lowered.includes(sensitive));
    if (!matched.length) return undefined;
    if (matched.every(name => name.includes('token'))) return 'token';
    if (matched.every(name => name === 'email')) return 'email';
    if (matched.every(name => name === 'phone')) return 'phone';
    return undefined;
};
