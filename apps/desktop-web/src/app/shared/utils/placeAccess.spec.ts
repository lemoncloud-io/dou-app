import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    relayUser: null as Record<string, unknown> | null,
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getRelaySessionUser: () => state.relayUser,
            // The user of the cloud the session is in. The rule must not read it.
            getActiveSessionUser: () => ({ userRole: 'admin', email: 'developer@lemoncloud.io' }),
        },
    },
}));

import { canManagePlaces, readPlaceManageAccess } from './placeAccess';

describe('canManagePlaces', () => {
    const allowed = ['dev@example.com'];

    it('lets an admin manage places', () => {
        expect(canManagePlaces({ userRole: 'admin' }, [])).toBe(true);
    });

    it('lets a listed email manage places, whatever its case or padding', () => {
        expect(canManagePlaces({ userRole: 'user', email: ' Dev@Example.com ' }, allowed)).toBe(true);
    });

    it('reads the address from the sign-in id when the token carries no email', () => {
        expect(canManagePlaces({ userRole: 'user', loginId: 'dev@example.com' }, allowed)).toBe(true);
    });

    it.each([
        ['an ordinary account', { userRole: 'user', email: 'someone@example.com' }],
        ['an account with no email', { userRole: 'user' }],
        ['an account whose sign-in id is not a listed address', { userRole: 'user', loginId: '1000050' }],
        ['an account with an empty email', { userRole: 'user', email: '' }],
        ['no account', null],
        ['an undefined account', undefined],
    ])('does not let %s manage places', (_label, account) => {
        expect(canManagePlaces(account, allowed)).toBe(false);
    });
});

describe('readPlaceManageAccess', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_ENV', 'DEV');
        state.relayUser = null;
    });
    afterEach(() => vi.unstubAllEnvs());

    it.each(['LOCAL', 'DEV', 'dev'])('lets a shared development sign-in through on a %s build', buildStage => {
        vi.stubEnv('VITE_ENV', buildStage);
        state.relayUser = { userRole: 'user', email: 'developer@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(true);
        // The shape the development server's token has: the address under `loginId`, no `email`.
        state.relayUser = { userRole: 'user', loginId: 'app@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(true);
    });

    // An unset or misspelt stage is the case that matters: it must not read as a development build.
    it.each(['PROD', '', 'STAGING'])('ignores the email list when the build stage is %j', buildStage => {
        vi.stubEnv('VITE_ENV', buildStage);
        state.relayUser = { userRole: 'user', email: 'developer@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(false);
    });

    it('lets an admin through on a production build', () => {
        vi.stubEnv('VITE_ENV', 'PROD');
        state.relayUser = { userRole: 'admin', email: 'someone@example.com' };
        expect(readPlaceManageAccess()).toBe(true);
    });

    it('goes by the relay account, not by an admin role held inside the cloud', () => {
        state.relayUser = { userRole: 'user', email: 'someone@example.com' };
        expect(readPlaceManageAccess()).toBe(false);
    });

    it('refuses when nobody is signed in', () => {
        expect(readPlaceManageAccess()).toBe(false);
    });
});
