import { beforeEach, describe, expect, it } from 'vitest';

import { storage } from '@chatic/shared';

import {
    OAUTH_LOGIN_START_TTL_MS,
    createOAuthLoginStart,
    evaluateOAuthDeeplink,
    saveOAuthLoginStart,
    takeOAuthLoginStart,
    type OAuthLoginStart,
} from './oauthLoginStart';

const NOW = 1_000_000;
const start: OAuthLoginStart = { provider: 'google', startedAt: NOW, nonce: 'n1' };
const deeplink = { provider: 'google', code: 'abc', nonce: 'n1' };
const withoutNonce = { provider: 'google', code: 'abc' };

describe('evaluateOAuthDeeplink', () => {
    it('accepts a deeplink for a fresh start of the same provider', () => {
        expect(evaluateOAuthDeeplink(start, deeplink, NOW + 1000)).toEqual({ ok: true });
    });

    it('rejects a deeplink when no login was started', () => {
        expect(evaluateOAuthDeeplink(null, deeplink, NOW)).toEqual({ ok: false, reason: 'no-start' });
    });

    it('accepts up to the last millisecond before the ttl and rejects from the ttl on', () => {
        expect(evaluateOAuthDeeplink(start, deeplink, NOW + OAUTH_LOGIN_START_TTL_MS - 1)).toEqual({ ok: true });
        expect(evaluateOAuthDeeplink(start, deeplink, NOW + OAUTH_LOGIN_START_TTL_MS)).toEqual({
            ok: false,
            reason: 'expired',
        });
    });

    it('treats a start from the future as expired', () => {
        expect(evaluateOAuthDeeplink(start, deeplink, NOW - 1)).toEqual({ ok: false, reason: 'expired' });
    });

    it('rejects a deeplink for another provider than the one started', () => {
        expect(evaluateOAuthDeeplink({ ...start, provider: 'kakao' }, deeplink, NOW)).toEqual({
            ok: false,
            reason: 'provider-mismatch',
        });
    });

    it('rejects a deeplink whose nonce differs from the record', () => {
        expect(evaluateOAuthDeeplink(start, { ...deeplink, nonce: 'other' }, NOW)).toEqual({
            ok: false,
            reason: 'nonce-mismatch',
        });
    });

    it('rejects a deeplink that carries no nonce', () => {
        expect(evaluateOAuthDeeplink(start, withoutNonce, NOW)).toEqual({ ok: false, reason: 'nonce-missing' });
    });

    it('names an expired start before a missing nonce, and a provider mismatch before it too', () => {
        expect(evaluateOAuthDeeplink(start, withoutNonce, NOW + OAUTH_LOGIN_START_TTL_MS)).toEqual({
            ok: false,
            reason: 'expired',
        });
        expect(evaluateOAuthDeeplink({ ...start, provider: 'kakao' }, withoutNonce, NOW)).toEqual({
            ok: false,
            reason: 'provider-mismatch',
        });
    });
});

describe('createOAuthLoginStart', () => {
    it('stamps the provider and time and draws a fresh hex nonce each time', () => {
        const a = createOAuthLoginStart('google', NOW);
        const b = createOAuthLoginStart('google', NOW);

        expect(a).toMatchObject({ provider: 'google', startedAt: NOW });
        expect(a.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(a.nonce).not.toBe(b.nonce);
    });
});

describe('start record storage', () => {
    beforeEach(() => localStorage.clear());

    it('returns what was saved and deletes it, so it is good once', () => {
        saveOAuthLoginStart(start);

        expect(takeOAuthLoginStart()).toEqual(start);
        expect(takeOAuthLoginStart()).toBeNull();
    });

    it('answers null when nothing was saved', () => {
        expect(takeOAuthLoginStart()).toBeNull();
    });

    it.each([
        'not json',
        '"a string"',
        'null',
        '{"provider":"google"}',
        '{"provider":"google","startedAt":"1","nonce":"n"}',
    ])('answers null for a malformed record %s and still deletes it', raw => {
        storage.set('chatic-oauth-login-start', raw);

        expect(takeOAuthLoginStart()).toBeNull();
        expect(storage.get('chatic-oauth-login-start')).toBeNull();
    });
});
