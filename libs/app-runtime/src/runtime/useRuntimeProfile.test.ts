import { renderHook } from '@testing-library/react';

import { getActiveSessionUser, useGlobalSession } from '@chatic/web-core';

import { useRuntimeProfile } from './useRuntimeProfile';
import { useRuntimeRepositories } from './useRuntimeRepositories';

// useRuntimeProfile sources uid/isCloudActive from useGlobalSession + the token seed accessor from
// web-core. Mock the whole web-core module (avoids transport's import.meta under jest); the
// repositories hook is mocked locally.
jest.mock('@chatic/web-core', () => ({
    getActiveSessionUser: jest.fn(),
    useGlobalSession: jest.fn(),
}));
jest.mock('./useRuntimeRepositories', () => ({ useRuntimeRepositories: jest.fn() }));

const observeItemMock = jest.fn();

// Emit `user` on subscribe (like the cache does on observe), or never emit when undefined.
const emit = (user: unknown) => {
    observeItemMock.mockImplementation((_id: string, cb: (u: unknown) => void) => {
        if (user !== undefined) cb(user);
        return jest.fn();
    });
};

const setSession = (opts: { userId: string | null; sessionUser?: unknown; hasCloud?: boolean }) => {
    // uid + isCloudActive are read straight from the web-core session.
    (useGlobalSession as jest.Mock).mockReturnValue({
        identity: { userId: opts.userId },
        cloud: { isActive: !!opts.hasCloud },
    });
    // getActiveSessionUser is the synchronous seed source (active token's user fields).
    (getActiveSessionUser as jest.Mock).mockReturnValue(opts.sessionUser ?? null);
};

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ user: { observeItem: observeItemMock } });
    emit(undefined);
});

describe('useRuntimeProfile', () => {
    it('seeds synchronously from the session token payload before the cache emits (no flash)', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'user', name: 'Seed' }, hasCloud: false });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.userRole).toBe('user');
        expect(result.current.isGuest).toBe(false);
        expect(result.current.isCloudActive).toBe(false);
        expect(result.current.userName).toBe('Seed');
    });

    it('tracks the cached profile once it emits, overriding the session seed', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'guest', name: 'Seed' }, hasCloud: false });
        emit({ userRole: 'user', name: 'Cache', photo: 'p.png' });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.userRole).toBe('user');
        expect(result.current.userName).toBe('Cache');
        expect(result.current.photo).toBe('p.png');
        expect(result.current.isGuest).toBe(false);
    });

    it('stops reporting guest once the session switches identity, even if only the OLD uid is cached', () => {
        // The guest→main promotion shape (phone verification: applySessionToken commits a new token
        // but writes no user row). observeItem never emits for the new uid, so the previous identity's
        // row is the only one in hand — it must not keep answering, or the invite gate dead-ends.
        setSession({ userId: 'device-user', sessionUser: { userRole: 'guest', name: 'Guest' } });
        emit({ userRole: 'guest', name: 'Guest cache' });

        const { result, rerender } = renderHook(() => useRuntimeProfile());
        expect(result.current.isGuest).toBe(true);

        setSession({ userId: 'main-user', sessionUser: { userRole: 'user', name: 'Main' } });
        emit(undefined); // no cached row for the promoted uid yet
        rerender();

        expect(result.current.userRole).toBe('user');
        expect(result.current.isGuest).toBe(false);
    });

    it('keeps guest when the cached row omits userRole (field-level fallback to the token seed)', () => {
        // A partial cache refresh (no userRole) must not flip a guest to non-guest — userRole falls
        // back to the token seed, while display fields still prefer the cached value.
        setSession({ userId: 'me', sessionUser: { userRole: 'guest', name: 'Seed' }, hasCloud: false });
        emit({ name: 'CacheNoRole' });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.userRole).toBe('guest');
        expect(result.current.isGuest).toBe(true);
        expect(result.current.userName).toBe('CacheNoRole');
    });

    it('derives isGuest from a guest role', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'guest' }, hasCloud: false });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.isGuest).toBe(true);
    });

    it('exposes isCloudActive from the active cloud session', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'user' }, hasCloud: true });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.isCloudActive).toBe(true);
        expect(result.current.isGuest).toBe(false);
    });

    it('falls back to Unknown with no session and no uid', () => {
        setSession({ userId: null });

        const { result } = renderHook(() => useRuntimeProfile());

        expect(result.current.userName).toBe('Unknown');
        expect(result.current.isGuest).toBe(false);
        expect(observeItemMock).not.toHaveBeenCalled();
    });
});
