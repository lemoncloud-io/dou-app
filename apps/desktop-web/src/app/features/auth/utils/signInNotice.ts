import { storage } from '@chatic/shared';

/**
 * What the app says once a Google sign-in has landed. A sign-in that replaces a session reloads the
 * app, so the word is left in storage for the signed-in shell to pick up, and taken once.
 */
export interface SignInNoticeRecord {
    provider: string;
    /** The server made the account just now: the Google had no DoU account yet. */
    isNew: boolean;
}

const SIGN_IN_NOTICE_KEY = 'chatic-signin-notice';

/**
 * Slack for a server clock that runs behind this one. A Google account that already owned a DoU account
 * was made long before any sign-in, so a minute of slack cannot mistake one for new. A clock here that
 * runs ahead by more than the slack plus the time spent in the browser errs the other way: a new account
 * reads as existing, and gets the toast instead of the stop.
 */
export const NEW_ACCOUNT_CLOCK_SLACK_MS = 60 * 1000;

/**
 * Whether the login response describes an account made by this sign-in. The server does not say so, but
 * the account's `createdAt` falls after the moment the sign-in started only when the sign-in made it.
 * Without a `createdAt` there is no evidence, and nothing is claimed.
 */
export const isAccountMadeSince = (account: unknown, startedAt: number): boolean => {
    const createdAt = (account as { createdAt?: unknown } | null)?.createdAt;
    return typeof createdAt === 'number' && createdAt >= startedAt - NEW_ACCOUNT_CLOCK_SLACK_MS;
};

export const saveSignInNotice = (notice: SignInNoticeRecord): void => {
    storage.set(SIGN_IN_NOTICE_KEY, JSON.stringify(notice));
};

/** Read the notice and delete it in the same call, so it is said once. */
export const takeSignInNotice = (): SignInNoticeRecord | null => {
    const raw = storage.get(SIGN_IN_NOTICE_KEY);
    storage.remove(SIGN_IN_NOTICE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<SignInNoticeRecord> | null;
        if (typeof parsed?.provider !== 'string' || typeof parsed.isNew !== 'boolean') return null;
        return { provider: parsed.provider, isNew: parsed.isNew };
    } catch {
        return null;
    }
};
