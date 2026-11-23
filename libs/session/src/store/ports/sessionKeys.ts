export const PAIRED_CLOUDS_KEY = 'chatic-paired-cloud-ids';

export const PAIRED_CLOUD_NAMES_KEY = 'chatic-paired-cloud-names';

export const SECRET_LOGOUT_PENDING_KEY = 'chatic-secret-logout-pending';

export const DELEGATOR_ID_KEY = 'chatic-delegator-id';

export const SESSION_KEYS = {
    secret: ['chatic-relay-token', 'chatic-cloud-delegation-token', 'chatic-cloud-token', 'chatic-cloud-token-cache'],
    plain: [
        'chatic-relay-selected-site-id',
        'chatic-selected-cloud-id',
        'chatic-selected-place-id',
        'chatic-cloud-identities',
        'chatic-recent-clouds',
        'chatic-reclaimed-clouds',
        DELEGATOR_ID_KEY,
        'chatic-device-id',
        PAIRED_CLOUDS_KEY,
        PAIRED_CLOUD_NAMES_KEY,
        SECRET_LOGOUT_PENDING_KEY,
    ],
} as const;

export type SessionKey = (typeof SESSION_KEYS)[keyof typeof SESSION_KEYS][number];

const ALL_SESSION_KEYS: ReadonlySet<string> = new Set([...SESSION_KEYS.secret, ...SESSION_KEYS.plain]);

export const isSessionKey = (key: string): key is SessionKey => ALL_SESSION_KEYS.has(key);
