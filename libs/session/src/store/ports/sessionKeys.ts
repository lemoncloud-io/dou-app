/**
 * The paired-cloud list's key. The list is written by `@chatic/auth`'s `PairedCloudStore`, not by a
 * store here, but it lives and dies with the session, so the session declares where it is kept.
 */
export const PAIRED_CLOUDS_KEY = 'chatic-paired-cloud-ids';

/**
 * The names of the paired clouds, beside their list and written by the same store. A paired cloud
 * has no row in the cloud cache (a row there is either owned or invited, and a paired cloud is
 * neither), so this is the only place its name is kept.
 */
export const PAIRED_CLOUD_NAMES_KEY = 'chatic-paired-cloud-names';

/**
 * Left in the plain port when a logout could not confirm that the vault was emptied, so the next boot
 * empties it before anything reads it.
 */
export const SECRET_LOGOUT_PENDING_KEY = 'chatic-secret-logout-pending';

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
        PAIRED_CLOUD_NAMES_KEY,
        SECRET_LOGOUT_PENDING_KEY,
    ],
} as const;

export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS][number];

const ALL_SESSION_KEYS: ReadonlySet<string> = new Set([...SESSION_KEYS.secret, ...SESSION_KEYS.plain]);

/** Whether `key` is one of the session's own keys, in either port. */
export const isSessionKey = (key: string): key is SessionKey => ALL_SESSION_KEYS.has(key);
