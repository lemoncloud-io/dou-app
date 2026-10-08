import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    buildStage: 'DEV' as string | undefined,
    relayUser: null as Record<string, unknown> | null,
}));

vi.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'env.buildStage' ? state.buildStage : undefined) },
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

    it.each([
        ['an ordinary account', { userRole: 'user', email: 'someone@example.com' }],
        ['an account with no email', { userRole: 'user' }],
        ['an account with an empty email', { userRole: 'user', email: '' }],
        ['no account', null],
        ['an undefined account', undefined],
    ])('does not let %s manage places', (_label, account) => {
        expect(canManagePlaces(account, allowed)).toBe(false);
    });
});

describe('readPlaceManageAccess', () => {
    beforeEach(() => {
        state.buildStage = 'DEV';
        state.relayUser = null;
    });

    it.each(['LOCAL', 'DEV'])('lets a shared development sign-in through on a %s build', buildStage => {
        state.buildStage = buildStage;
        state.relayUser = { userRole: 'user', email: 'developer@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(true);
        state.relayUser = { userRole: 'user', email: 'app@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(true);
    });

    it.each(['PROD', undefined])('ignores the email list when the build stage is %s', buildStage => {
        state.buildStage = buildStage;
        state.relayUser = { userRole: 'user', email: 'developer@lemoncloud.io' };
        expect(readPlaceManageAccess()).toBe(false);
    });

    it('lets an admin through on a production build', () => {
        state.buildStage = 'PROD';
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
