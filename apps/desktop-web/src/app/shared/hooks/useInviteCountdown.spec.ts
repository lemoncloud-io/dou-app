import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderHook } from '@testing-library/react';

import { useInviteCountdown } from './useInviteCountdown';

describe('useInviteCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('returns null when there is no expiry', () => {
        const { result } = renderHook(() => useInviteCountdown(undefined));

        expect(result.current).toBeNull();
    });

    it('breaks a future expiry into days and hours', () => {
        const { result } = renderHook(() => useInviteCountdown(Date.now() + 2 * 24 * 3_600_000 + 3_600_000));

        expect(result.current).toMatchObject({ days: 2, hours: 1, isExpired: false, isImminent: false });
    });

    it('flags an expiry ten minutes out as imminent', () => {
        const { result } = renderHook(() => useInviteCountdown(Date.now() + 9 * 60_000));

        expect(result.current).toMatchObject({ isExpired: false, isImminent: true });
    });

    it('settles expired and stops ticking', () => {
        const { result } = renderHook(() => useInviteCountdown(Date.now() - 1_000));

        expect(result.current).toMatchObject({ isExpired: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears its tick on unmount', () => {
        const { unmount } = renderHook(() => useInviteCountdown(Date.now() + 60_000));

        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
