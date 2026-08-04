import { act, renderHook } from '@testing-library/react';

import { useInviteCountdown } from './useInviteCountdown';

const SECOND = 1_000;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
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

    it('puts the imminent boundary at exactly 10 minutes, not 10:59', () => {
        // Floored minutes would call 10:59 imminent; visible now that the card counts by the second.
        const { result: at } = renderHook(() => useInviteCountdown(NOW + 10 * MINUTE));
        expect(at.current?.isImminent).toBe(true);

        const { result: justOver } = renderHook(() => useInviteCountdown(NOW + 10 * MINUTE + SECOND));
        expect(justOver.current?.isImminent).toBe(false);
    });

    it('reserves 00:00:00 for expiry by rounding the remaining second up', () => {
        const { result } = renderHook(() => useInviteCountdown(NOW + 400));
        expect(result.current).toMatchObject({ seconds: 1, isExpired: false });
    });

    it('stops ticking once expired instead of re-rendering forever', () => {
        let renders = 0;
        const { result } = renderHook(() => {
            renders += 1;
            return useInviteCountdown(NOW + SECOND);
        });

        act(() => {
            jest.advanceTimersByTime(30 * SECOND);
        });

        expect(result.current?.isExpired).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
        // Mount (initializer + effect) plus the single tick that observed expiry.
        expect(renders).toBeLessThanOrEqual(4);
    });

    it('ticks by the minute while more than a day remains', () => {
        const { result } = renderHook(() => useInviteCountdown(NOW + 3 * DAY + 5 * MINUTE));
        expect(result.current).toMatchObject({ days: 3, hours: 0, minutes: 5 });

        // A second passing changes nothing: above a day the card shows "n일 n시간", so re-evaluating
        // every second would be 60 renders a minute for a string that turns over once an hour.
        act(() => {
            jest.advanceTimersByTime(SECOND);
        });
        expect(result.current).toMatchObject({ minutes: 5 });

        // A minute does.
        act(() => {
            jest.advanceTimersByTime(MINUTE);
        });
        expect(result.current).toMatchObject({ days: 3, hours: 0, minutes: 4 });
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
