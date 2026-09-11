/**
 * `hooks/memberships/use-debounced-value.spec.ts`
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
    it('처음에는 값을 그대로 낸다', () => {
        const { result } = renderHook(() => useDebouncedValue('a', 300));
        expect(result.current).toBe('a');
    });

    it('지연이 지나기 전에는 옛 값을 유지한다', () => {
        const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
            initialProps: { v: 'a' },
        });

        rerender({ v: 'ab' });
        act(() => void vi.advanceTimersByTime(299));

        expect(result.current).toBe('a');
    });

    it('지연이 지나면 새 값을 낸다', () => {
        const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
            initialProps: { v: 'a' },
        });

        rerender({ v: 'ab' });
        act(() => void vi.advanceTimersByTime(300));

        expect(result.current).toBe('ab');
    });

    // 타이핑 중에는 매 글자마다 요청이 나가면 안 된다 — 마지막 값 하나만 반영된다.
    it('연속 입력은 마지막 값 하나로 정리된다', () => {
        const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), {
            initialProps: { v: '1' },
        });

        rerender({ v: '10' });
        act(() => void vi.advanceTimersByTime(100));
        rerender({ v: '100' });
        act(() => void vi.advanceTimersByTime(100));
        rerender({ v: '1000' });
        act(() => void vi.advanceTimersByTime(300));

        expect(result.current).toBe('1000');
    });
});
