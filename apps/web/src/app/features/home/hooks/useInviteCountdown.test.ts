import { act, renderHook } from '@testing-library/react';

import { useInviteCountdown } from './useInviteCountdown';

const SECOND = 1_000;
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

    it('breaks the remaining time into days / hours / minutes / seconds', () => {
        // 1 day + 2 hours + 3 minutes + 4 seconds ahead.
        const expiredAt = NOW + (26 * 60 + 3) * MINUTE + 4 * SECOND;
        const { result } = renderHook(() => useInviteCountdown(expiredAt));

        expect(result.current).toMatchObject({ days: 1, hours: 2, minutes: 3, seconds: 4, isExpired: false });
    });

    it('ticks every second so the HH:mm:ss display stays live', () => {
        const { result } = renderHook(() => useInviteCountdown(NOW + 2 * MINUTE));
        expect(result.current).toMatchObject({ minutes: 2, seconds: 0 });

        act(() => {
            jest.advanceTimersByTime(SECOND);
        });

        expect(result.current).toMatchObject({ minutes: 1, seconds: 59 });
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
