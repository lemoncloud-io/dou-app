import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

vi.mock('@chatic/bridges', () => ({
    isNative: vi.fn(() => true),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const disconnect = vi.fn(() => Promise.resolve());
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            recoverUnverifiedSockets: vi.fn(() => Promise.resolve()),
            // Present so a regression back to the bare disconnect shows up as a call here.
            getSocketManager: () => ({ disconnect, getSnapshot: () => ({ isVerified: false }) }),
        },
    },
}));

import { isNative } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';

import { useSocketWakeRecovery } from './useSocketWakeRecovery';

const recover = runtime.connection.recoverUnverifiedSockets as unknown as ReturnType<typeof vi.fn>;
const BASE = new Date('2026-10-20T00:00:00.000Z').getTime();

const setVisibility = (state: DocumentVisibilityState) =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

describe('useSocketWakeRecovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(BASE);
        vi.mocked(isNative).mockReturnValue(true);
        recover.mockClear();
        disconnect.mockClear();
        setVisibility('visible');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs the runtime wake pass on focus, never a bare disconnect that would leave the socket closed', () => {
        renderHook(() => useSocketWakeRecovery());

        window.dispatchEvent(new Event('focus'));

        expect(recover).toHaveBeenCalledTimes(1);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it('kicks on online and on becoming visible too, one kick per five seconds', () => {
        renderHook(() => useSocketWakeRecovery());

        window.dispatchEvent(new Event('online'));
        document.dispatchEvent(new Event('visibilitychange'));
        expect(recover).toHaveBeenCalledTimes(1);

        vi.setSystemTime(BASE + 5_001);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(recover).toHaveBeenCalledTimes(2);
    });

    it('ignores a hide edge', () => {
        renderHook(() => useSocketWakeRecovery());
        setVisibility('hidden');

        document.dispatchEvent(new Event('visibilitychange'));

        expect(recover).not.toHaveBeenCalled();
    });

    it('does nothing in a plain browser tab, and stops listening once unmounted', () => {
        vi.mocked(isNative).mockReturnValue(false);
        renderHook(() => useSocketWakeRecovery());
        window.dispatchEvent(new Event('focus'));
        expect(recover).not.toHaveBeenCalled();

        vi.mocked(isNative).mockReturnValue(true);
        const { unmount } = renderHook(() => useSocketWakeRecovery());
        unmount();
        window.dispatchEvent(new Event('focus'));
        expect(recover).not.toHaveBeenCalled();
    });
});
