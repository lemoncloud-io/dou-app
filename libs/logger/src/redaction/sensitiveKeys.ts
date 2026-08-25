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
];

/** Placeholder written in place of a masked value. */
export const REDACTED = '[REDACTED]';

/** Whether a field name looks secret-bearing (case-insensitive substring match). */
export const isSensitiveKey = (key: string): boolean => {
    const lowered = key.toLowerCase();
    return SENSITIVE_KEYS.some(sensitive => lowered.includes(sensitive));
};
