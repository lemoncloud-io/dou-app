/**
 * The paired-cloud list's key. The list is written by `@chatic/auth`'s `PairedCloudStore`, not by a
 * store here, but it lives and dies with the session, so the session declares where it is kept.
 */
export const PAIRED_CLOUDS_KEY = 'chatic-paired-cloud-ids';

/** Which port each session key lives in. Nothing else may write these keys. */
export const SESSION_KEYS = {
    secret: ['chatic-relay-token', 'chatic-cloud-delegation-token', 'chatic-cloud-token', 'chatic-cloud-token-cache'],
    plain: [
        'chatic-relay-selected-site-id',
        'chatic-selected-cloud-id',
        'chatic-selected-place-id',
        'chatic-cloud-identities',
        'chatic-recent-clouds',
        'chatic-reclaimed-clouds',
        'chatic-delegator-id',
        'chatic-device-id',
        PAIRED_CLOUDS_KEY,
    ],
} as const;

export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS][number];

const ALL_SESSION_KEYS: ReadonlySet<string> = new Set([...SESSION_KEYS.secret, ...SESSION_KEYS.plain]);

/** Whether `key` is one of the session's own keys, in either port. */
export const isSessionKey = (key: string): key is SessionKey => ALL_SESSION_KEYS.has(key);
