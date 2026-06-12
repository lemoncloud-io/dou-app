import { renderHook, act } from '@testing-library/react';
import { Platform } from 'react-native';
import { useResumeOverlay } from './useResumeOverlay';

const mockAddEventListener = jest.fn();

jest.mock('react-native', () => ({
    AppState: {
        addEventListener: (event: string, listener: (...args: any[]) => any) => mockAddEventListener(event, listener),
    },
    Platform: {
        OS: 'ios',
    },
}));

describe('useResumeOverlay hook', () => {
    let appStateListeners: { [key: string]: ((...args: any[]) => any)[] } = {};

    beforeEach(() => {
        Platform.OS = 'ios';
        jest.useFakeTimers();
        appStateListeners = {};
        mockAddEventListener.mockClear();
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
});
