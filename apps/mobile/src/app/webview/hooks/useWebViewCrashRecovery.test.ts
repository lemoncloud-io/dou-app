import { act, renderHook } from '@testing-library/react';

import {
    CRASH_LOOP_LIMIT,
    CRASH_LOOP_WINDOW_MS,
    FIRST_SCREEN_CAP_MS,
    useWebViewCrashRecovery,
} from './useWebViewCrashRecovery';

const mockEnqueue = jest.fn();
const mockAppStateListeners = new Set<(state: string) => void>();
let mockAppState = 'active';

jest.mock('react-native', () => ({
    AppState: {
        get currentState() {
            return mockAppState;
        },
        addEventListener: (_event: string, listener: (state: string) => void) => {
            mockAppStateListeners.add(listener);
            return { remove: () => mockAppStateListeners.delete(listener) };
        },
    },
}));

const moveAppTo = (state: string) =>
    act(() => {
        mockAppState = state;
        mockAppStateListeners.forEach(listener => listener(state));
    });

const mockStartReloadSession = jest.fn();
const mockRevealListeners = new Set<() => void>();

jest.mock('../../services', () => ({
    bootMetricsService: { startReloadSession: () => mockStartReloadSession() },
    bootSplashService: {
        subscribe: (listener: () => void) => {
            mockRevealListeners.add(listener);
            return () => mockRevealListeners.delete(listener);
        },
    },
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    pendingReportQueueService: { enqueue: (report: unknown) => mockEnqueue(report) },
}));

const revealWeb = () => act(() => mockRevealListeners.forEach(listener => listener()));

const setup = () => {
    const reload = jest.fn();
    const coverReload = jest.fn();
    const onGiveUp = jest.fn();
    const hook = renderHook(() => useWebViewCrashRecovery({ reload, coverReload, onGiveUp }));
    const terminate = (reason = 'iOS WebView content process terminated') => act(() => hook.result.current(reason));
    return { reload, coverReload, onGiveUp, terminate, unmount: hook.unmount };
};

describe('useWebViewCrashRecovery', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockEnqueue.mockClear();
        mockStartReloadSession.mockClear();
        mockRevealListeners.clear();
        mockAppStateListeners.clear();
        mockAppState = 'active';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('reports a single termination and reloads under the cover', () => {
        const { reload, coverReload, onGiveUp, terminate } = setup();

        terminate();

        expect(mockEnqueue).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'webview-crash', message: 'iOS WebView content process terminated' })
        );
        expect(mockStartReloadSession).toHaveBeenCalledTimes(1);
        expect(coverReload).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it('stops reloading and gives up once terminations reach the limit inside the window', () => {
        const { reload, onGiveUp, terminate } = setup();

        for (let i = 0; i < CRASH_LOOP_LIMIT; i += 1) {
            terminate();
            revealWeb();
            jest.advanceTimersByTime(1000);
        }

        expect(reload).toHaveBeenCalledTimes(CRASH_LOOP_LIMIT - 1);
        expect(onGiveUp).toHaveBeenCalledTimes(1);
        expect(onGiveUp).toHaveBeenCalledWith('crash-loop');
        expect(mockEnqueue).toHaveBeenCalledTimes(CRASH_LOOP_LIMIT + 1);
        expect(mockEnqueue).toHaveBeenLastCalledWith(
            expect.objectContaining({ category: 'webview-crash', message: expect.stringContaining('crash-loop') })
        );
    });

    it('keeps reloading when the terminations are spread wider than the window', () => {
        const { reload, onGiveUp, terminate } = setup();

        for (let i = 0; i < CRASH_LOOP_LIMIT + 1; i += 1) {
            terminate();
            revealWeb();
            jest.advanceTimersByTime(CRASH_LOOP_WINDOW_MS);
        }

        expect(reload).toHaveBeenCalledTimes(CRASH_LOOP_LIMIT + 1);
        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it('gives up when the reloaded page never reports a first screen', () => {
        const { onGiveUp, terminate } = setup();

        terminate();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS - 1);
        expect(onGiveUp).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);

        expect(onGiveUp).toHaveBeenCalledWith('no-first-screen');
        expect(mockEnqueue).toHaveBeenLastCalledWith(
            expect.objectContaining({ category: 'webview-crash', message: expect.stringContaining('no-first-screen') })
        );
    });

    it('does not give up when the reloaded page reports its first screen in time', () => {
        const { onGiveUp, terminate } = setup();

        terminate();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS - 1);
        revealWeb();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);

        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it('gives up on a loop that never reaches a first screen', () => {
        const { reload, onGiveUp, terminate } = setup();

        for (let i = 0; i < CRASH_LOOP_LIMIT; i += 1) {
            terminate();
            jest.advanceTimersByTime(1000);
        }

        expect(reload).toHaveBeenCalledTimes(CRASH_LOOP_LIMIT - 1);
        expect(onGiveUp).toHaveBeenCalledTimes(1);
        expect(onGiveUp).toHaveBeenCalledWith('crash-loop');
    });

    it('ignores terminations after it has given up', () => {
        const { reload, onGiveUp, terminate } = setup();
        for (let i = 0; i < CRASH_LOOP_LIMIT; i += 1) terminate();
        mockEnqueue.mockClear();

        terminate();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);

        expect(onGiveUp).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(CRASH_LOOP_LIMIT - 1);
        expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('does not count time in the background against the reload', () => {
        const { onGiveUp, terminate } = setup();
        moveAppTo('background');

        terminate();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS * 3);
        expect(onGiveUp).not.toHaveBeenCalled();

        moveAppTo('active');
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS - 1);
        expect(onGiveUp).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onGiveUp).toHaveBeenCalledWith('no-first-screen');
    });

    it('pauses a running watchdog when the app leaves the foreground', () => {
        const { onGiveUp, terminate } = setup();

        terminate();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS - 1000);
        moveAppTo('background');
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);
        moveAppTo('active');
        revealWeb();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);

        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it('gives up when a fresh mount never reports a first screen', () => {
        const { reload, onGiveUp } = setup();

        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS - 1);
        expect(onGiveUp).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);

        expect(onGiveUp).toHaveBeenCalledWith('no-first-screen');
        expect(reload).not.toHaveBeenCalled();
    });

    it('stays quiet once the mounted page reports its first screen', () => {
        const { onGiveUp } = setup();

        revealWeb();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS * 2);

        expect(onGiveUp).not.toHaveBeenCalled();
    });

    it('starts the mount wait only once the app is in the foreground', () => {
        mockAppState = 'background';
        const { onGiveUp } = setup();

        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS * 2);
        expect(onGiveUp).not.toHaveBeenCalled();

        moveAppTo('active');
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);
        expect(onGiveUp).toHaveBeenCalledWith('no-first-screen');
    });

    it('drops the watchdog when the WebView unmounts', () => {
        const { onGiveUp, terminate, unmount } = setup();

        terminate();
        unmount();
        jest.advanceTimersByTime(FIRST_SCREEN_CAP_MS);

        expect(onGiveUp).not.toHaveBeenCalled();
    });
});
