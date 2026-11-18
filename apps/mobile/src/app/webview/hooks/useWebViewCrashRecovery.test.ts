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

// Stub the services barrel: importing the real one drags in the whole provider
// (MMKV, SQLite, Firebase, ...) which cannot load under jsdom.
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

/** What the boot splash service does when a (re)loaded page reports its first screen. */
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

    // Reloading into a page that kills its process again only repeats the crash; past the limit the
    // reader gets the retry view instead of a cover that never lifts onto anything.
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
        // Every termination is still reported, plus one record of giving up.
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

    // The case seen on the iOS simulator: the process launched for the reload died before it could
    // load anything, and no second termination ever reached the app.
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

    // A callback still in flight while the host swaps in the retry view must not report twice.
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

    // The OS often reclaims the content process of a backgrounded app; the reload cannot paint until
    // the app is back, and must not be given up on for that.
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

    // Seen on the iOS simulator after "Try again": the new WebView's content process died while
    // launching, no termination reached the app, and the screen stayed blank.
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

    // An app started in the background (a silent push) mounts the WebView before anyone sees it.
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
