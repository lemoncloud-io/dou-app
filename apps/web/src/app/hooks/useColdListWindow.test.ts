import { act, renderHook } from '@testing-library/react';

import { COLD_LIST_WINDOW_MS, useColdListWindowElapsed } from './useColdListWindow';

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useColdListWindowElapsed — the bound on waiting for a list', () => {
    it('has not elapsed on the first render', () => {
        const { result } = renderHook(() => useColdListWindowElapsed('place:cloud-A:u1'));

        expect(result.current).toBe(false);
    });

    it('elapses once the window passes', () => {
        const { result } = renderHook(() => useColdListWindowElapsed('place:cloud-A:u1'));

        act(() => {
            jest.advanceTimersByTime(COLD_LIST_WINDOW_MS);
        });

        expect(result.current).toBe(true);
    });

    it('has not elapsed one tick short of the window', () => {
        const { result } = renderHook(() => useColdListWindowElapsed('place:cloud-A:u1'));

        act(() => {
            jest.advanceTimersByTime(COLD_LIST_WINDOW_MS - 1);
        });

        expect(result.current).toBe(false);
    });

    it('restarts the window when the scope changes', () => {
        // A cloud switch must get the whole wait again, not inherit the previous cloud's expired one.
        const { result, rerender } = renderHook(({ scope }) => useColdListWindowElapsed(scope), {
            initialProps: { scope: 'place:cloud-A:u1' },
        });

        act(() => {
            jest.advanceTimersByTime(COLD_LIST_WINDOW_MS);
        });
        expect(result.current).toBe(true);

        rerender({ scope: 'place:cloud-B:u1' });

        expect(result.current).toBe(false);
    });

    it('clears its timer on unmount', () => {
        const { unmount } = renderHook(() => useColdListWindowElapsed('place:cloud-A:u1'));

        unmount();

        expect(jest.getTimerCount()).toBe(0);
    });
});
