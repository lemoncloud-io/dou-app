import { renderHook, act } from '@testing-library/react';
import { Platform } from 'react-native';

import { RELOAD_COVER_CAP_MS, useResumeOverlay } from './useResumeOverlay';

const mockAddEventListener = jest.fn();
const mockRecordForegroundResume = jest.fn();

jest.mock('react-native', () => ({
    AppState: {
        addEventListener: (event: string, listener: (...args: any[]) => any) => mockAddEventListener(event, listener),
    },
    Platform: {
        OS: 'ios',
    },
}));

// Stub the services barrel: importing the real one drags in the whole provider
// (MMKV, SQLite, Firebase, ...) which cannot load under jsdom.
const mockRevealListeners = new Set<() => void>();
jest.mock('../../services', () => ({
    bootMetricsService: { recordForegroundResume: (ms: number) => mockRecordForegroundResume(ms) },
    bootSplashService: {
        subscribe: (listener: () => void) => {
            mockRevealListeners.add(listener);
            return () => mockRevealListeners.delete(listener);
        },
    },
}));

/** What the boot splash service does when the web reports its first screen. */
const revealWeb = () => mockRevealListeners.forEach(listener => listener());

describe('useResumeOverlay hook', () => {
    let appStateListeners: { [key: string]: ((...args: any[]) => any)[] } = {};

    beforeEach(() => {
        Platform.OS = 'ios';
        jest.useFakeTimers();
        appStateListeners = {};
        mockAddEventListener.mockClear();
        mockRecordForegroundResume.mockClear();
        mockRevealListeners.clear();
        mockAddEventListener.mockImplementation((event, listener) => {
            if (!appStateListeners[event]) {
                appStateListeners[event] = [];
            }
            appStateListeners[event].push(listener);
            return {
                remove: () => {
                    appStateListeners[event] = appStateListeners[event].filter(l => l !== listener);
                },
            } as any;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const triggerAppStateChange = (nextState: string) => {
        if (appStateListeners['change']) {
            appStateListeners['change'].forEach(l => l(nextState));
        }
    };

    it('should initialize showResumeOverlay as false', () => {
        const { result } = renderHook(() => useResumeOverlay());
        expect(result.current.showResumeOverlay).toBe(false);
    });

    it('should show overlay on iOS when app state changes to background or inactive', () => {
        Platform.OS = 'ios';
        const { result } = renderHook(() => useResumeOverlay());

        act(() => {
            triggerAppStateChange('background');
        });
        expect(result.current.showResumeOverlay).toBe(true);

        act(() => {
            result.current.dismissOverlay();
        });
        expect(result.current.showResumeOverlay).toBe(false);

        act(() => {
            triggerAppStateChange('inactive');
        });
        expect(result.current.showResumeOverlay).toBe(true);
    });

    it('should set fallback timer to hide overlay after 1.5s on iOS when app state becomes active', () => {
        Platform.OS = 'ios';
        const { result } = renderHook(() => useResumeOverlay());

        act(() => {
            triggerAppStateChange('background');
        });
        expect(result.current.showResumeOverlay).toBe(true);

        act(() => {
            triggerAppStateChange('active');
        });
        // Still true immediately
        expect(result.current.showResumeOverlay).toBe(true);

        // Advance timer by 1.5s
        act(() => {
            jest.advanceTimersByTime(1500);
        });
        expect(result.current.showResumeOverlay).toBe(false);
    });

    it('복귀(active) 후 dismiss까지의 소요시간을 부팅 메트릭에 기록한다', () => {
        Platform.OS = 'ios';
        const { result } = renderHook(() => useResumeOverlay());

        act(() => {
            triggerAppStateChange('background');
            triggerAppStateChange('active');
        });
        act(() => {
            jest.advanceTimersByTime(400);
            result.current.dismissOverlay();
        });

        expect(mockRecordForegroundResume).toHaveBeenCalledTimes(1);
        expect(mockRecordForegroundResume.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
    });

    it('should not register listeners or show overlay on Android', () => {
        Platform.OS = 'android';
        const { result } = renderHook(() => useResumeOverlay());

        // Should not register any listener
        expect(mockAddEventListener).not.toHaveBeenCalled();

        act(() => {
            triggerAppStateChange('background');
        });
        // Should remain false
        expect(result.current.showResumeOverlay).toBe(false);
    });

    // A crashed content process reloads into a full web boot with no launch splash to cover it.
    describe('crash-reload cover', () => {
        it('covers on Android too, until the reloaded web reports its first screen', () => {
            Platform.OS = 'android';
            const { result } = renderHook(() => useResumeOverlay());

            act(() => {
                result.current.coverReload();
            });
            expect(result.current.showResumeOverlay).toBe(true);

            act(() => {
                revealWeb();
            });
            expect(result.current.showResumeOverlay).toBe(false);
        });

        it('lifts on its cap when the web never reports', () => {
            const { result } = renderHook(() => useResumeOverlay());

            act(() => {
                result.current.coverReload();
            });
            act(() => {
                jest.advanceTimersByTime(RELOAD_COVER_CAP_MS - 1);
            });
            expect(result.current.showResumeOverlay).toBe(true);

            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(result.current.showResumeOverlay).toBe(false);
        });

        // Two causes, two flags: the resume fallback must not lift a cover the reload still needs.
        it('stays up while a resume dismissal clears only the resume cause', () => {
            const { result } = renderHook(() => useResumeOverlay());

            act(() => {
                triggerAppStateChange('background');
                result.current.coverReload();
            });
            act(() => {
                result.current.dismissOverlay();
            });

            expect(result.current.showResumeOverlay).toBe(true);
        });
    });
});
