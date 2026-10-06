import { storage } from '@chatic/shared';

import type { OAuthDeeplinkPayload } from './oauth';

/**
 * The record that a social login was started from this app. A `chatic://oauth` deeplink can be opened
 * by anything on the machine — a web page, a document, another app — so the deeplink alone proves
 * nothing about who began the login; an unprompted one would sign the person in as whoever owns the
 * code it carries. The deeplink is only honoured when a start record is waiting for it.
 */
export interface OAuthLoginStart {
    provider: string;
    startedAt: number;
    /** Random per start. Not sent to the relay yet — see `evaluateOAuthDeeplink`. */
    nonce: string;
}

/** How long a start stays valid: the browser consent screen plus the hand-off back to the app. */
export const OAUTH_LOGIN_START_TTL_MS = 10 * 60 * 1000;

/**
 * Persistent storage (localStorage in the shell, see `setStorageAdapter` in main.tsx): a start is
 * often followed by the app quitting and being relaunched by the deeplink.
 */
const OAUTH_LOGIN_START_KEY = 'chatic-oauth-login-start';

export type OAuthDeeplinkRejection = 'no-start' | 'expired' | 'provider-mismatch' | 'nonce-mismatch';

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
 * The nonce is checked when the deeplink carries one and ignored when it does not. The relay sits
 * outside this repository and nobody has confirmed it returns what rides the `redirect` address, so
 * requiring it today would break every login. Until that is confirmed this leaves one gap: a link
 * opened inside the ten-minute window of a login the person really started still passes.
 * Closing it means sending the nonce (`buildAuthorizeUrl`), having the hand-off page forward it,
 * and then making its absence a rejection here.
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
    if (payload.nonce !== undefined && payload.nonce !== start.nonce) return { ok: false, reason: 'nonce-mismatch' };
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
