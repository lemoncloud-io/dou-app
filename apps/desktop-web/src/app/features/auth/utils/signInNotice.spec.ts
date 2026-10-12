import { beforeEach, describe, expect, it } from 'vitest';

import { setStorageAdapter } from '@chatic/shared';

import { NEW_ACCOUNT_CLOCK_SLACK_MS, isAccountMadeSince, saveSignInNotice, takeSignInNotice } from './signInNotice';

describe('isAccountMadeSince', () => {
    const START = 1_000_000_000;

    it('reads an account made after the sign-in started as new', () => {
        expect(isAccountMadeSince({ createdAt: START + 5_000 }, START)).toBe(true);
    });

    it('allows for a server clock a little behind this one', () => {
        expect(isAccountMadeSince({ createdAt: START - NEW_ACCOUNT_CLOCK_SLACK_MS }, START)).toBe(true);
    });

    it('reads an account made before the sign-in as existing', () => {
        expect(isAccountMadeSince({ createdAt: START - NEW_ACCOUNT_CLOCK_SLACK_MS - 1 }, START)).toBe(false);
    });

    it('claims nothing without a createdAt', () => {
        expect(isAccountMadeSince({}, START)).toBe(false);
        expect(isAccountMadeSince(undefined, START)).toBe(false);
        expect(isAccountMadeSince({ createdAt: '2026-10-12' }, START)).toBe(false);
    });
});

describe('sign-in notice storage', () => {
    beforeEach(() => {
        setStorageAdapter(localStorage);
        localStorage.clear();
    });

    it('is said once', () => {
        saveSignInNotice({ provider: 'google', isNew: true });

        expect(takeSignInNotice()).toEqual({ provider: 'google', isNew: true });
        expect(takeSignInNotice()).toBeNull();
    });

    it('drops an unreadable notice', () => {
        localStorage.setItem('chatic-signin-notice', '{"provider":1}');
        expect(takeSignInNotice()).toBeNull();

        localStorage.setItem('chatic-signin-notice', 'not json');
        expect(takeSignInNotice()).toBeNull();
    });
});
