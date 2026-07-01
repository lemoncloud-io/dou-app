import { renderHook } from '@testing-library/react';

import { getActiveSessionUser, useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { useSessionProfile } from './useSessionProfile';
import { useRuntimeRepositories } from './useRuntimeRepositories';

// useSessionProfile only needs the session hooks + the token seed accessor from web-core. Mock the
// whole module (avoids transport's import.meta under jest); no pure derivations are needed.
jest.mock('@chatic/web-core', () => ({
    getActiveSessionUser: jest.fn(),
    useSessionIdentity: jest.fn(),
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
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: opts.userId });
    // getActiveSessionUser is the synchronous seed source (active token's user fields).
    (getActiveSessionUser as jest.Mock).mockReturnValue(opts.sessionUser ?? null);
    (useGlobalSession as jest.Mock).mockReturnValue({ cloud: { isActive: !!opts.hasCloud } });
};

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ user: { observeItem: observeItemMock } });
    emit(undefined);
});

describe('useSessionProfile', () => {
    it('seeds synchronously from the session token payload before the cache emits (no flash)', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'user', name: 'Seed' }, hasCloud: false });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.userRole).toBe('user');
        expect(result.current.isGuest).toBe(false);
        expect(result.current.isCloudActive).toBe(false);
        expect(result.current.userName).toBe('Seed');
    });

    it('tracks the cached profile once it emits, overriding the session seed', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'guest', name: 'Seed' }, hasCloud: false });
        emit({ userRole: 'user', name: 'Cache', photo: 'p.png' });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.userRole).toBe('user');
        expect(result.current.userName).toBe('Cache');
        expect(result.current.photo).toBe('p.png');
        expect(result.current.isGuest).toBe(false);
    });

    it('keeps guest when the cached row omits userRole (field-level fallback to the token seed)', () => {
        // A partial cache refresh (no userRole) must not flip a guest to non-guest — userRole falls
        // back to the token seed, while display fields still prefer the cached value.
        setSession({ userId: 'me', sessionUser: { userRole: 'guest', name: 'Seed' }, hasCloud: false });
        emit({ name: 'CacheNoRole' });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.userRole).toBe('guest');
        expect(result.current.isGuest).toBe(true);
        expect(result.current.userName).toBe('CacheNoRole');
    });

    it('derives isGuest from a guest role', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'guest' }, hasCloud: false });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.isGuest).toBe(true);
    });

    it('exposes isCloudActive from the active cloud session', () => {
        setSession({ userId: 'me', sessionUser: { userRole: 'user' }, hasCloud: true });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.isCloudActive).toBe(true);
        expect(result.current.isGuest).toBe(false);
    });

    it('falls back to Unknown with no session and no uid', () => {
        setSession({ userId: null });

        const { result } = renderHook(() => useSessionProfile());

        expect(result.current.userName).toBe('Unknown');
        expect(result.current.isGuest).toBe(false);
        expect(observeItemMock).not.toHaveBeenCalled();
    });
});
