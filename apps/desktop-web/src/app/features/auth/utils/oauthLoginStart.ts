import { plainStore } from '../../../storage';

import type { OAuthDeeplinkPayload } from './oauth';

export type OAuthStartIntent = 'login' | 'link';

export interface OAuthLoginStart {
    provider: string;
    intent: OAuthStartIntent;
    account?: string;
    startedAt: number;
    nonce: string;
}

export const OAUTH_LOGIN_START_TTL_MS = 10 * 60 * 1000;

const OAUTH_LOGIN_START_KEY = 'chatic-oauth-login-start';

export type OAuthDeeplinkRejection = 'no-start' | 'expired' | 'provider-mismatch' | 'nonce-missing' | 'nonce-mismatch';

export type OAuthDeeplinkVerdict = { ok: true } | { ok: false; reason: OAuthDeeplinkRejection };

const createNonce = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const createOAuthLoginStart = (
    provider: string,
    now: number,
    intent: OAuthStartIntent = 'login',
    account?: string
): OAuthLoginStart => ({
    provider,
    intent,
    ...(account ? { account } : {}),
    startedAt: now,
    nonce: createNonce(),
});

export const evaluateOAuthDeeplink = (
    start: OAuthLoginStart | null,
    payload: OAuthDeeplinkPayload,
    now: number
): OAuthDeeplinkVerdict => {
    if (!start) return { ok: false, reason: 'no-start' };
    const age = now - start.startedAt;
    if (age < 0 || age >= OAUTH_LOGIN_START_TTL_MS) return { ok: false, reason: 'expired' };
    if (start.provider !== payload.provider) return { ok: false, reason: 'provider-mismatch' };
    if (payload.nonce === undefined) return { ok: false, reason: 'nonce-missing' };
    if (payload.nonce !== start.nonce) return { ok: false, reason: 'nonce-mismatch' };
    return { ok: true };
};

export const saveOAuthLoginStart = (start: OAuthLoginStart): void => {
    plainStore.set(OAUTH_LOGIN_START_KEY, JSON.stringify(start));
};

const isLoginStart = (
    value: unknown
): value is Omit<OAuthLoginStart, 'intent' | 'account'> & { intent?: unknown; account?: unknown } => {
    if (typeof value !== 'object' || value === null) return false;
    const { provider, startedAt, nonce } = value as Record<string, unknown>;
    return (
        typeof provider === 'string' &&
        typeof startedAt === 'number' &&
        Number.isFinite(startedAt) &&
        typeof nonce === 'string'
    );
};

export const takeOAuthLoginStart = (): OAuthLoginStart | null => {
    const raw = plainStore.get(OAUTH_LOGIN_START_KEY);
    plainStore.remove(OAUTH_LOGIN_START_KEY);
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isLoginStart(parsed)) return null;
        const { intent, account, ...rest } = parsed;
        return {
            ...rest,
            intent: intent === 'link' ? 'link' : 'login',
            ...(typeof account === 'string' ? { account } : {}),
        };
    } catch {
        return null;
    }
};

const OAUTH_USED_NONCES_KEY = 'chatic-oauth-used-nonces';
const USED_NONCES_KEPT = 5;

const readUsedNonces = (): string[] => {
    try {
        const parsed: unknown = JSON.parse(plainStore.get(OAUTH_USED_NONCES_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
    } catch {
        return [];
    }
};

export const rememberUsedOAuthNonce = (nonce: string): void => {
    const kept = [nonce, ...readUsedNonces().filter(n => n !== nonce)].slice(0, USED_NONCES_KEPT);
    plainStore.set(OAUTH_USED_NONCES_KEY, JSON.stringify(kept));
};

export const isUsedOAuthNonce = (nonce: string | undefined): boolean =>
    nonce !== undefined && readUsedNonces().includes(nonce);
