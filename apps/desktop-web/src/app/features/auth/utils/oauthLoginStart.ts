import { storage } from '@chatic/shared';

import type { OAuthDeeplinkPayload } from './oauth';

/**
 * The record that a social login was started from this app. A `chatic://oauth` deeplink can be opened
 * by anything on the machine — a web page, a document, another app — so the deeplink alone proves
 * nothing about who began the login; an unprompted one would sign the person in as whoever owns the
 * code it carries. The deeplink is only honoured when a start record is waiting for it and the link
 * carries that record's nonce.
 */
export interface OAuthLoginStart {
    provider: string;
    startedAt: number;
    /**
     * Random per start. It rides the relay's `redirect` address and has to come back on the deeplink;
     * it marks the link as belonging to this start and is not a secret.
     */
    nonce: string;
}

/** How long a start stays valid: the browser consent screen plus the hand-off back to the app. */
export const OAUTH_LOGIN_START_TTL_MS = 10 * 60 * 1000;

/**
 * Persistent storage (localStorage in the shell, see `setStorageAdapter` in main.tsx): a start is
 * often followed by the app quitting and being relaunched by the deeplink.
 */
const OAUTH_LOGIN_START_KEY = 'chatic-oauth-login-start';

export type OAuthDeeplinkRejection = 'no-start' | 'expired' | 'provider-mismatch' | 'nonce-missing' | 'nonce-mismatch';

export type OAuthDeeplinkVerdict = { ok: true } | { ok: false; reason: OAuthDeeplinkRejection };

const createNonce = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const createOAuthLoginStart = (provider: string, now: number): OAuthLoginStart => ({
    provider,
    startedAt: now,
    nonce: createNonce(),
});

/**
 * Whether a deeplink may be exchanged. Pure: the caller supplies the record and the clock.
 *
 * The checks run in a fixed order so the reason names what is most useful to know: a start that is
 * missing, then one that has expired, then the provider, then the nonce — absent before different.
 * A deeplink without the nonce is refused even when a fresh start is waiting: the nonce is what
 * separates a link that came back from this start from one that was merely opened on the machine
 * inside the ten-minute window.
 */
export const evaluateOAuthDeeplink = (
    start: OAuthLoginStart | null,
    payload: OAuthDeeplinkPayload,
    now: number
): OAuthDeeplinkVerdict => {
    if (!start) return { ok: false, reason: 'no-start' };
    const age = now - start.startedAt;
    // A negative age means the clock moved back since the start; treat it as stale, not as fresh.
    if (age < 0 || age >= OAUTH_LOGIN_START_TTL_MS) return { ok: false, reason: 'expired' };
    if (start.provider !== payload.provider) return { ok: false, reason: 'provider-mismatch' };
    if (payload.nonce === undefined) return { ok: false, reason: 'nonce-missing' };
    if (payload.nonce !== start.nonce) return { ok: false, reason: 'nonce-mismatch' };
    return { ok: true };
};

export const saveOAuthLoginStart = (start: OAuthLoginStart): void => {
    storage.set(OAUTH_LOGIN_START_KEY, JSON.stringify(start));
};

const isLoginStart = (value: unknown): value is OAuthLoginStart => {
    if (typeof value !== 'object' || value === null) return false;
    const { provider, startedAt, nonce } = value as Record<string, unknown>;
    return (
        typeof provider === 'string' &&
        typeof startedAt === 'number' &&
        Number.isFinite(startedAt) &&
        typeof nonce === 'string'
    );
};

/**
 * Read the start record and delete it in the same call. A record is good for one deeplink whatever
 * that deeplink's fate — accepted, rejected or expired — so a replayed link finds nothing.
 */
export const takeOAuthLoginStart = (): OAuthLoginStart | null => {
    const raw = storage.get(OAUTH_LOGIN_START_KEY);
    storage.remove(OAUTH_LOGIN_START_KEY);
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return isLoginStart(parsed) ? parsed : null;
    } catch {
        return null;
    }
};
