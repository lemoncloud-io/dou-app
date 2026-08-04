import { act, renderHook } from '@testing-library/react';

import { useOtpExpiryCountdown } from './useOtpExpiryCountdown';

const NOW = new Date('2026-07-29T12:00:00Z').getTime();

describe('useOtpExpiryCountdown — 서버 expiredAt 기준 초 단위 카운트다운', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('expiredAt이 없으면 null을 돌려준다 (첫 발송 전)', () => {
        const { result } = renderHook(() => useOtpExpiryCountdown(undefined));
        expect(result.current).toBeNull();
    });

    it('남은 초를 1초 간격으로 줄여 나간다', () => {
        const { result } = renderHook(() => useOtpExpiryCountdown(NOW + 180_000));
        expect(result.current).toEqual({ secondsLeft: 180, isExpired: false });

        act(() => jest.advanceTimersByTime(2_000));
        expect(result.current).toEqual({ secondsLeft: 178, isExpired: false });
    });

    it('만료 시각에 닿으면 isExpired가 켜지고 0에서 멈춘다', () => {
        const { result } = renderHook(() => useOtpExpiryCountdown(NOW + 3_000));

        act(() => jest.advanceTimersByTime(5_000));
        expect(result.current).toEqual({ secondsLeft: 0, isExpired: true });
    });

    it('재전송이 새 expiredAt을 주면 새 서버 기한으로 다시 센다', () => {
        const { result, rerender } = renderHook(({ expiredAt }) => useOtpExpiryCountdown(expiredAt), {
            initialProps: { expiredAt: NOW + 3_000 },
        });
        act(() => jest.advanceTimersByTime(5_000));
        expect(result.current?.isExpired).toBe(true);

        rerender({ expiredAt: NOW + 5_000 + 180_000 });
        expect(result.current).toEqual({ secondsLeft: 180, isExpired: false });
    });

    it('이미 지난 expiredAt은 즉시 만료로 계산한다', () => {
        const { result } = renderHook(() => useOtpExpiryCountdown(NOW - 1_000));
        expect(result.current).toEqual({ secondsLeft: 0, isExpired: true });
    });
});
