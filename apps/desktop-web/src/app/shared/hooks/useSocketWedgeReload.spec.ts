import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type * as ZustandModule from 'zustand';

// Mock the host (control whether the page owns its window, through the runtime's `appShell` port), the
// bridge (capture logger.warn) and the two stores the hook reads. The stores are real zustand instances
// so selector reads, getState() and setState() all behave exactly as in the app — only their module
// wiring is faked.
const { ownsWindow } = vi.hoisted(() => ({ ownsWindow: vi.fn(() => true) }));
vi.mock('@chatic/bridges', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// v2: socket verification comes from the runtime's `runtime.connection.useRuntimeSocketState()` (reactive) and
// `runtime.connection.getRuntimeSocketState()` (imperative, re-checked inside the grace timer) —
// back both with one zustand store so they stay consistent. Auth is `runtime.session.useSessionAuth()`.
vi.mock('@chatic/runtime', async () => {
    const { create } = await vi.importActual<typeof ZustandModule>('zustand');
    const socketStore = create(() => ({ isVerified: false }));
    const { browserAppShell, fakeRuntimeModule } = await import('@chatic/runtime/testing');
    return fakeRuntimeModule({
        connection: {
            useRuntimeSocketState: socketStore,
            getRuntimeSocketState: () => socketStore.getState(),
        },
        // `useSessionAuth` is the session group's, no longer @chatic/web-core's. Still a zustand
        // store because the test drives it with setState.
        session: { useSessionAuth: create(() => ({ isAuthenticated: false })) },
        get appShell() {
            return { ...browserAppShell(), ownsWindow: ownsWindow() };
        },
    });
});

import { runtime } from '@chatic/runtime';

// The mocked exports ARE zustand stores (hook + setState); cast for the test driver.
type MockStore<T> = { getState: () => T; setState: (partial: Partial<T>) => void };
const socketStore = runtime.connection.useRuntimeSocketState as unknown as MockStore<{ isVerified: boolean }>;
const authStore = runtime.session.useSessionAuth as unknown as MockStore<{ isAuthenticated: boolean }>;

import { useSocketWedgeReload } from './useSocketWedgeReload';

const GRACE_MS = 25_000;
const GUARD_MS = 5 * 60_000;
const RELOAD_AT_KEY = 'chatic:wedge-reload-at';
const BASE = new Date('2026-06-19T00:00:00.000Z').getTime();

let reloadMock: ReturnType<typeof vi.fn>;

const setVerified = (isVerified: boolean) => act(() => socketStore.setState({ isVerified }));
const setAuthenticated = (isAuthenticated: boolean) => act(() => authStore.setState({ isAuthenticated }));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

// Drive the hook to the armed state: own window + authenticated + verified once, then
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
    vi.mocked(ownsWindow).mockReturnValue(true);
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

    it('is a no-op where the page does not own its window (a browser tab)', () => {
        vi.mocked(ownsWindow).mockReturnValue(false);
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
