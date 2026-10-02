import { renderHook } from '@testing-library/react';

import { usePreloadOnIdle } from './routeChunks';

describe('usePreloadOnIdle', () => {
    const originalIdle = globalThis.requestIdleCallback;
    const originalCancelIdle = globalThis.cancelIdleCallback;

    afterEach(() => {
        globalThis.requestIdleCallback = originalIdle;
        globalThis.cancelIdleCallback = originalCancelIdle;
        jest.useRealTimers();
    });

    it('waits for the fallback delay when there is no idle callback, then loads once', () => {
        // @ts-expect-error -- the iOS WKWebView has no requestIdleCallback
        delete globalThis.requestIdleCallback;
        jest.useFakeTimers();
        const load = jest.fn().mockResolvedValue({});

        renderHook(() => usePreloadOnIdle(load));
        jest.advanceTimersByTime(1_999);
        expect(load).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('loads when the browser reports idle', () => {
        let idle: (() => void) | undefined;
        globalThis.requestIdleCallback = jest.fn(cb => {
            idle = () => cb({} as IdleDeadline);
            return 1;
        });
        // A browser with one has both.
        globalThis.cancelIdleCallback = jest.fn();
        const load = jest.fn().mockResolvedValue({});

        const { unmount } = renderHook(() => usePreloadOnIdle(load));
        expect(load).not.toHaveBeenCalled();

        idle?.();
        expect(load).toHaveBeenCalledTimes(1);
        // Unmounted here, while the stubbed cancelIdleCallback is still in place.
        unmount();
    });

    it('does not load after the shell unmounted first', () => {
        // @ts-expect-error -- the iOS WKWebView has no requestIdleCallback
        delete globalThis.requestIdleCallback;
        jest.useFakeTimers();
        const load = jest.fn().mockResolvedValue({});

        const { unmount } = renderHook(() => usePreloadOnIdle(load));
        unmount();
        jest.advanceTimersByTime(2_000);

        expect(load).not.toHaveBeenCalled();
    });

    it('handles a failed load itself, leaving the route to meet and report the failure', () => {
        // @ts-expect-error -- the iOS WKWebView has no requestIdleCallback
        delete globalThis.requestIdleCallback;
        jest.useFakeTimers();
        const handled = jest.fn();
        const load = jest.fn(() => ({ catch: handled }) as unknown as Promise<unknown>);

        renderHook(() => usePreloadOnIdle(load));
        jest.advanceTimersByTime(2_000);

        expect(handled).toHaveBeenCalledTimes(1);
    });
});
