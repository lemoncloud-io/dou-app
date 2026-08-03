import React from 'react';
import { render } from '@testing-library/react';

import { Platform } from 'react-native';

import { SystemBars } from './SystemBars';

const mockSetBarStyle = jest.fn();
const mockSetAppearance = jest.fn();
const mockIsDark = jest.fn();

type Listener = (payload: any) => void;
const listeners: { appState: Listener[]; dimensions: Listener[] } = { appState: [], dimensions: [] };
const removeAppState = jest.fn();
const removeDimensions = jest.fn();

const PORTRAIT = { width: 375, height: 812 };
const LANDSCAPE = { width: 812, height: 375 };
let currentWindow = PORTRAIT;

jest.mock('react-native', () => {
    const StatusBar: any = jest.fn(() => null);
    StatusBar.setBarStyle = (...args: any[]) => mockSetBarStyle(...args);

    return {
        StatusBar,
        Platform: { OS: 'android' },
        AppState: {
            // `remove` actually drops the listener, so a stale subscription left behind by a
            // broken cleanup surfaces as a failure rather than an extra silent call.
            addEventListener: (_event: string, listener: Listener) => {
                listeners.appState.push(listener);
                return {
                    remove: () => {
                        listeners.appState = listeners.appState.filter(l => l !== listener);
                        removeAppState();
                    },
                };
            },
        },
        Dimensions: {
            get: () => currentWindow,
            addEventListener: (_event: string, listener: Listener) => {
                listeners.dimensions.push(listener);
                return {
                    remove: () => {
                        listeners.dimensions = listeners.dimensions.filter(l => l !== listener);
                        removeDimensions();
                    },
                };
            },
        },
    };
});

/** Simulate a metrics change (rotation or keyboard resize). */
const emitDimensions = (window: { width: number; height: number }) => {
    currentWindow = window;
    listeners.dimensions.forEach(listener => listener({ window }));
};

jest.mock('../../../bridge/SystemBarsBridge', () => ({
    SystemBarsBridge: { setAppearance: (isDark: boolean) => mockSetAppearance(isDark) },
}));

jest.mock('../../../hooks', () => ({
    useResolvedTheme: () => ({ isDark: mockIsDark() }),
}));

describe('SystemBars — 시스템 바 멱등 재적용', () => {
    beforeEach(() => {
        listeners.appState = [];
        listeners.dimensions = [];
        currentWindow = PORTRAIT;
        Platform.OS = 'android';
        mockSetBarStyle.mockReset();
        mockSetAppearance.mockReset();
        mockIsDark.mockReset();
        removeAppState.mockReset();
        removeDimensions.mockReset();
    });

    it('마운트 시 현재 테마를 상태바와 안드로이드 시스템 바에 적용한다', () => {
        mockIsDark.mockReturnValue(true);

        render(<SystemBars />);

        expect(mockSetBarStyle).toHaveBeenCalledWith('light-content', true);
        expect(mockSetAppearance).toHaveBeenCalledWith(true);
    });

    it('라이트 테마에서는 dark-content를 적용한다', () => {
        mockIsDark.mockReturnValue(false);

        render(<SystemBars />);

        expect(mockSetBarStyle).toHaveBeenCalledWith('dark-content', true);
        expect(mockSetAppearance).toHaveBeenCalledWith(false);
    });

    it('백그라운드 복귀(active) 시 테마가 그대로여도 다시 적용한다', () => {
        mockIsDark.mockReturnValue(false);
        render(<SystemBars />);
        mockSetBarStyle.mockClear();
        mockSetAppearance.mockClear();

        // This is the regression under test: the value did not change, so a
        // value-dependent effect would do nothing and the bars would stay wrong.
        listeners.appState.forEach(listener => listener('active'));

        expect(mockSetBarStyle).toHaveBeenCalledWith('dark-content', true);
        expect(mockSetAppearance).toHaveBeenCalledWith(false);
    });

    it('background/inactive 전환에서는 적용하지 않는다', () => {
        mockIsDark.mockReturnValue(false);
        render(<SystemBars />);
        mockSetBarStyle.mockClear();
        mockSetAppearance.mockClear();

        listeners.appState.forEach(listener => listener('background'));
        listeners.appState.forEach(listener => listener('inactive'));

        expect(mockSetBarStyle).not.toHaveBeenCalled();
        expect(mockSetAppearance).not.toHaveBeenCalled();
    });

    it('복귀 시 최신 테마를 적용한다 (스테일 클로저 회귀 방지)', () => {
        mockIsDark.mockReturnValue(false);
        const { rerender } = render(<SystemBars />);

        mockIsDark.mockReturnValue(true);
        rerender(<SystemBars />);
        mockSetBarStyle.mockClear();

        listeners.appState.forEach(listener => listener('active'));

        // If the effect stopped re-subscribing on theme change (deps -> []), the resume path
        // would keep re-applying the theme captured at mount.
        expect(mockSetBarStyle).toHaveBeenCalledWith('light-content', true);
        expect(mockSetBarStyle).not.toHaveBeenCalledWith('dark-content', true);
    });

    it('화면 회전 시에도 다시 적용한다', () => {
        mockIsDark.mockReturnValue(true);
        render(<SystemBars />);
        mockSetBarStyle.mockClear();

        emitDimensions(LANDSCAPE);

        expect(mockSetBarStyle).toHaveBeenCalledWith('light-content', true);
    });

    it('방향이 그대로인 metrics 변경(키보드 리사이즈)에는 반응하지 않는다', () => {
        mockIsDark.mockReturnValue(true);
        render(<SystemBars />);
        mockSetBarStyle.mockClear();
        mockSetAppearance.mockClear();

        // Android adjustResize fires 'change' on every keyboard open/close; re-applying there
        // would cross the native bridge on each keystroke-adjacent event for no benefit.
        emitDimensions({ width: PORTRAIT.width, height: PORTRAIT.height - 300 });

        expect(mockSetBarStyle).not.toHaveBeenCalled();
        expect(mockSetAppearance).not.toHaveBeenCalled();
    });

    it('iOS에서는 안드로이드 전용 시스템 바 브릿지를 호출하지 않는다', () => {
        Platform.OS = 'ios';
        mockIsDark.mockReturnValue(true);

        render(<SystemBars />);

        expect(mockSetBarStyle).toHaveBeenCalledWith('light-content', true);
        expect(mockSetAppearance).not.toHaveBeenCalled();
    });

    it('언마운트 시 두 구독을 모두 해제한다', () => {
        mockIsDark.mockReturnValue(false);
        const { unmount } = render(<SystemBars />);

        unmount();

        expect(removeAppState).toHaveBeenCalled();
        expect(removeDimensions).toHaveBeenCalled();
    });
});
