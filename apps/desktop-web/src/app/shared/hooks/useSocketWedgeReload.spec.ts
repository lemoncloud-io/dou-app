import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type * as ZustandModule from 'zustand';

// Mock the bridge (control isNative; capture logger.warn) and the two stores the
// hook reads. The stores are real zustand instances so selector reads, getState()
// and setState() all behave exactly as in the app — only their module wiring is faked.
vi.mock('@chatic/bridges', () => ({
    isNative: vi.fn(() => true),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// v2: socket verification comes from app-runtime's `useSocketState()` (reactive) and
// `getSocketManager().getSnapshot()` (imperative, re-checked inside the grace timer) —
// back both with one zustand store so they stay consistent. Auth is `useSessionAuth()`.
vi.mock('@chatic/app-runtime', async () => {
    const { create } = await vi.importActual<typeof ZustandModule>('zustand');
    const socketStore = create(() => ({ isVerified: false }));
    return {
        useSocketState: socketStore,
        getSocketManager: () => ({ getSnapshot: () => socketStore.getState() }),
    };
});
vi.mock('@chatic/web-core', async () => {
    const { create } = await vi.importActual<typeof ZustandModule>('zustand');
    return { useSessionAuth: create(() => ({ isAuthenticated: false })) };
});

import { isNative } from '@chatic/bridges';
import { useSocketState } from '@chatic/app-runtime';
import { useSessionAuth } from '@chatic/web-core';

// The mocked exports ARE zustand stores (hook + setState); cast for the test driver.
type MockStore<T> = { getState: () => T; setState: (partial: Partial<T>) => void };
const socketStore = useSocketState as unknown as MockStore<{ isVerified: boolean }>;
const authStore = useSessionAuth as unknown as MockStore<{ isAuthenticated: boolean }>;

import { useSocketWedgeReload } from './useSocketWedgeReload';

const GRACE_MS = 25_000;
const GUARD_MS = 5 * 60_000;
const RELOAD_AT_KEY = 'chatic:wedge-reload-at';
const BASE = new Date('2026-06-19T00:00:00.000Z').getTime();

let reloadMock: ReturnType<typeof vi.fn>;

const setVerified = (isVerified: boolean) => act(() => socketStore.setState({ isVerified }));
const setAuthenticated = (isAuthenticated: boolean) => act(() => authStore.setState({ isAuthenticated }));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

// Drive the hook to the armed state: native + authenticated + verified once, then
// the socket loses verification (the post-sleep wedge). Returns renderHook's handle.
const arm = () => {
    const handle = renderHook(() => useSocketWedgeReload());
    setAuthenticated(true);
    setVerified(true); // verify once → hook remembers it can regress
    return handle;
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    sessionStorage.clear();
    vi.mocked(isNative).mockReturnValue(true);
    socketStore.setState({ isVerified: false });
    authStore.setState({ isAuthenticated: false });
    reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { href: 'http://localhost/', reload: reloadMock },
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('useSocketWedgeReload', () => {
    it('reloads once when a verified socket stays unverified past the grace window', () => {
        const { unmount } = arm();
        setVerified(false); // wedge

        advance(GRACE_MS - 1);
        expect(reloadMock).not.toHaveBeenCalled(); // still inside grace

        advance(1);
        expect(reloadMock).toHaveBeenCalledTimes(1);
        // Stamps the guard so a follow-up wedge isn't reloaded in a loop.
        expect(sessionStorage.getItem(RELOAD_AT_KEY)).toBe(String(BASE + GRACE_MS));
        unmount();
    });

    it('does not reload if the socket recovers within the grace window', () => {
        const { unmount } = arm();
        setVerified(false); // wedge
        advance(10_000);
        setVerified(true); // recovered — effect cleanup cancels the pending reload
        advance(GRACE_MS);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('never arms on a cold start that has not verified yet', () => {
        // Authenticated but the socket has never reached isVerified=true this session,
        // so a slow first connect must not be mistaken for a wedge.
        const { unmount } = renderHook(() => useSocketWedgeReload());
        setAuthenticated(true);
        advance(GRACE_MS * 2);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('is a no-op outside the Electron shell (isNative false)', () => {
        vi.mocked(isNative).mockReturnValue(false);
        const { unmount } = arm();
        setVerified(false);
        advance(GRACE_MS * 2);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('skips the reload if one already happened within the guard window', () => {
        const { unmount } = arm();
        // A reload fired moments ago (genuine expiry, not a stale credential).
        sessionStorage.setItem(RELOAD_AT_KEY, String(BASE));
        setVerified(false); // wedge again
        advance(GRACE_MS);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('reloads again once the guard window has elapsed', () => {
        const { unmount } = arm();
        // Last reload was longer than the guard ago → a fresh wedge may reload again.
        sessionStorage.setItem(RELOAD_AT_KEY, String(BASE - GUARD_MS - 1));
        setVerified(false);
        advance(GRACE_MS);
        expect(reloadMock).toHaveBeenCalledTimes(1);
        unmount();
    });
});
