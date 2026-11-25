import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type * as ZustandModule from 'zustand';

const { ownsWindow } = vi.hoisted(() => ({ ownsWindow: vi.fn(() => true) }));
vi.mock('@chatic/bridges', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@chatic/runtime-react', async () => {
    const { create } = await vi.importActual<typeof ZustandModule>('zustand');
    const socketStore = create(() => ({ isVerified: false }));
    const { browserAppShell, fakeRuntimeModule } = await import('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        connection: {
            useRuntimeSocketState: socketStore,
            getRuntimeSocketState: () => socketStore.getState(),
        },
        session: { useSessionAuth: create(() => ({ isAuthenticated: false })) },
        get appShell() {
            return { ...browserAppShell(), ownsWindow: ownsWindow() };
        },
    });
});

import { runtime } from '@chatic/runtime-react';

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

const arm = () => {
    const handle = renderHook(() => useSocketWedgeReload());
    setAuthenticated(true);
    setVerified(true);
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
        setVerified(false);

        advance(GRACE_MS - 1);
        expect(reloadMock).not.toHaveBeenCalled();

        advance(1);
        expect(reloadMock).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(RELOAD_AT_KEY)).toBe(String(BASE + GRACE_MS));
        unmount();
    });

    it('does not reload if the socket recovers within the grace window', () => {
        const { unmount } = arm();
        setVerified(false);
        advance(10_000);
        setVerified(true);
        advance(GRACE_MS);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('never arms on a cold start that has not verified yet', () => {
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
        sessionStorage.setItem(RELOAD_AT_KEY, String(BASE));
        setVerified(false);
        advance(GRACE_MS);
        expect(reloadMock).not.toHaveBeenCalled();
        unmount();
    });

    it('reloads again once the guard window has elapsed', () => {
        const { unmount } = arm();
        sessionStorage.setItem(RELOAD_AT_KEY, String(BASE - GUARD_MS - 1));
        setVerified(false);
        advance(GRACE_MS);
        expect(reloadMock).toHaveBeenCalledTimes(1);
        unmount();
    });
});
