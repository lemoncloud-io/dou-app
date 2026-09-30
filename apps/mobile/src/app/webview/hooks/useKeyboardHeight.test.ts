import { act, renderHook } from '@testing-library/react';
import { Platform } from 'react-native';

import { toWebViewKeyboardHeight, useKeyboardHeight } from './useKeyboardHeight';

type KeyboardListener = (e: { endCoordinates: { height: number } }) => void;

const mockListeners = new Map<string, KeyboardListener>();
let mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };

jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    Keyboard: {
        addListener: (event: string, listener: KeyboardListener) => {
            mockListeners.set(event, listener);
            return { remove: () => mockListeners.delete(event) };
        },
    },
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => mockInsets,
}));

const emit = (event: string, height = 0) => act(() => mockListeners.get(event)?.({ endCoordinates: { height } }));

describe('toWebViewKeyboardHeight', () => {
    it('adds the bottom inset back on Android, where the reported height leaves the navigation bar out', () => {
        expect(toWebViewKeyboardHeight('android', 280, 48)).toBe(328);
    });

    it('uses the reported height as is on iOS, which already reaches the screen edge', () => {
        expect(toWebViewKeyboardHeight('ios', 336, 34)).toBe(336);
    });

    it('keeps a closed keyboard at 0 on Android instead of turning it into the navigation bar height', () => {
        expect(toWebViewKeyboardHeight('android', 0, 48)).toBe(0);
    });

    it('floors a floating Android keyboard, reported as minus the navigation bar, at 0', () => {
        expect(toWebViewKeyboardHeight('android', -48, 48)).toBe(0);
        expect(toWebViewKeyboardHeight('android', -60, 48)).toBe(0);
    });
});

describe('useKeyboardHeight', () => {
    beforeEach(() => {
        mockListeners.clear();
        mockInsets = { top: 24, right: 0, bottom: 48, left: 0 };
        Platform.OS = 'android';
    });

    it('reports the covered height including the navigation bar on Android, and 0 once hidden', () => {
        const { result } = renderHook(() => useKeyboardHeight());
        expect(result.current).toBe(0);

        emit('keyboardDidShow', 280);
        expect(result.current).toBe(328);

        emit('keyboardDidHide');
        expect(result.current).toBe(0);
    });

    it('injects 0 for a floating Android keyboard rather than a negative height', () => {
        const { result } = renderHook(() => useKeyboardHeight());

        emit('keyboardDidShow', -48);
        expect(result.current).toBe(0);
    });

    it('follows a change of the bottom inset while the keyboard stays open', () => {
        const { result, rerender } = renderHook(() => useKeyboardHeight());
        emit('keyboardDidShow', 280);
        expect(result.current).toBe(328);

        mockInsets = { ...mockInsets, bottom: 24 };
        rerender();
        expect(result.current).toBe(304);
    });

    it('listens to the Will events on iOS and passes the height through', () => {
        Platform.OS = 'ios';
        const { result } = renderHook(() => useKeyboardHeight());

        emit('keyboardWillShow', 336);
        expect(result.current).toBe(336);

        emit('keyboardWillHide');
        expect(result.current).toBe(0);
    });

    it('removes its listeners on unmount', () => {
        const { unmount } = renderHook(() => useKeyboardHeight());
        expect(mockListeners.size).toBe(2);

        unmount();
        expect(mockListeners.size).toBe(0);
    });
});
