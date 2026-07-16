import { act, renderHook } from '@testing-library/react';

import { useInviteCountdown } from './useInviteCountdown';

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useInviteCountdown', () => {
    it('returns null when no expiry is given', () => {
        const { result } = renderHook(() => useInviteCountdown(undefined));
        expect(result.current).toBeNull();
    });

    it('breaks the remaining time into days / hours / minutes', () => {
        // 1 day + 2 hours + 3 minutes ahead.
        const expiredAt = NOW + (26 * 60 + 3) * MINUTE;
        const { result } = renderHook(() => useInviteCountdown(expiredAt));

        expect(result.current).toMatchObject({ days: 1, hours: 2, minutes: 3, isExpired: false });
    });

    it('flags imminent at or below 10 minutes', () => {
        const { result } = renderHook(() => useInviteCountdown(NOW + 9 * MINUTE));
        expect(result.current?.isImminent).toBe(true);

        const { result: far } = renderHook(() => useInviteCountdown(NOW + 20 * MINUTE));
        expect(far.current?.isImminent).toBe(false);
    });

    it('becomes expired once the deadline passes', () => {
        const { result } = renderHook(() => useInviteCountdown(NOW + MINUTE));
        expect(result.current?.isExpired).toBe(false);

        act(() => {
            jest.advanceTimersByTime(2 * MINUTE);
        });

        expect(result.current?.isExpired).toBe(true);
        expect(result.current?.isImminent).toBe(false);
    });
});
