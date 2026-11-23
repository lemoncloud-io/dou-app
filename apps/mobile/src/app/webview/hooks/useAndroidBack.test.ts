import { act, renderHook } from '@testing-library/react';

import { pushedEventErrors, pushedEvents } from './appEventContract';
import { useAndroidBack } from './useAndroidBack';
import { nextWebBackReport, resolveCanGoBack, useWebViewNavigation } from './useWebViewNavigation';

let mockPlatformOS = 'android';
let mockOnBackPress: (() => boolean) | undefined;

jest.mock('react-native', () => ({
    BackHandler: {
        addEventListener: jest.fn((event: string, handler: () => boolean) => {
            if (event === 'hardwareBackPress') mockOnBackPress = handler;
            return { remove: jest.fn() };
        }),
    },
    Platform: {
        get OS() {
            return mockPlatformOS;
        },
    },
}));
jest.mock('../../bridge', () => ({ BackNavigationBridge: { setCanGoBack: jest.fn() } }));
let mockSubView: object | null = null;
let mockSubViewListener: (() => void) | undefined;
jest.mock('../../services', () => ({
    subWebViewService: {
        current: () => mockSubView,
        subscribe: (listener: () => void) => {
            mockSubViewListener = listener;
            return () => (mockSubViewListener = undefined);
        },
    },
}));

describe('useAndroidBack', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        mockPlatformOS = 'android';
        mockOnBackPress = undefined;
        mockSubView = null;
        bridge = { pushEvent: jest.fn() };
    });

    describe('app → web event contract', () => {
        it("pushes 'OnBackPressed' and consumes the press while the web can go back", () => {
            renderHook(() => useAndroidBack(bridge as any, true));

            const consumed = mockOnBackPress?.();

            expect(consumed).toBe(true);
            expect(pushedEvents(bridge.pushEvent)).toEqual([expect.objectContaining({ type: 'OnBackPressed' })]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        it('pushes nothing and leaves the press to the OS while the web cannot go back', () => {
            renderHook(() => useAndroidBack(bridge as any, false));

            const consumed = mockOnBackPress?.();

            expect(consumed).toBe(false);
            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        it("pushes 'OnBackPressed' only after the web reports SetCanGoBack true", () => {
            const handlers: Record<string, (message: unknown) => unknown> = {};
            const host = {
                pushEvent: bridge.pushEvent,
                registerHandler: (type: string, handler: (message: unknown) => unknown) => (handlers[type] = handler),
                unregisterHandler: jest.fn(),
            };
            renderHook(() => useWebViewNavigation(host as any));

            expect(mockOnBackPress?.()).toBe(false);
            act(() => {
                handlers.SetCanGoBack({ type: 'SetCanGoBack', data: { canGoBack: true } });
            });
            expect(mockOnBackPress?.()).toBe(true);

            expect(pushedEvents(bridge.pushEvent)).toEqual([expect.objectContaining({ type: 'OnBackPressed' })]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        it('pushes nothing and passes the press on while a sub WebView shows', () => {
            mockSubView = { viewId: 'view-1' };
            renderHook(() => useAndroidBack(bridge as any, true));

            const consumed = mockOnBackPress?.();

            expect(consumed).toBe(false);
            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        it('listens for nothing on iOS, which has no back button', () => {
            mockPlatformOS = 'ios';

            renderHook(() => useAndroidBack(bridge as any, true));

            expect(mockOnBackPress).toBeUndefined();
        });
    });
});

describe('resolveCanGoBack', () => {
    const page = (canGoBack: boolean, includesHistory: boolean) => ({ canGoBack, includesHistory });

    it("follows a page's whole answer and ignores the WebView's history", () => {
        expect(resolveCanGoBack(page(false, true), true)).toBe(false);
        expect(resolveCanGoBack(page(true, true), false)).toBe(true);
    });

    it("adds the WebView's history to an older page's overlay-only answer", () => {
        expect(resolveCanGoBack(page(false, false), true)).toBe(true);
        expect(resolveCanGoBack(page(true, false), false)).toBe(true);
        expect(resolveCanGoBack(page(false, false), false)).toBe(false);
    });
});

describe('nextWebBackReport', () => {
    const last = { canGoBack: true, includesHistory: true };

    it('keeps the same report for an unchanged answer', () => {
        expect(nextWebBackReport(last, { canGoBack: true, includesHistory: true })).toBe(last);
    });

    it('replaces the report whole when the answer changes', () => {
        expect(nextWebBackReport(last, { canGoBack: false, includesHistory: true })).toEqual({
            canGoBack: false,
            includesHistory: true,
        });
        expect(nextWebBackReport(last, { canGoBack: true })).toEqual({ canGoBack: true, includesHistory: false });
    });
});

describe('useWebViewNavigation', () => {
    let handlers: Record<string, (message: unknown) => unknown>;
    let pushEvent: jest.Mock;

    const mount = () => {
        handlers = {};
        pushEvent = jest.fn();
        const host = {
            pushEvent,
            registerHandler: (type: string, handler: (message: unknown) => unknown) => (handlers[type] = handler),
            unregisterHandler: jest.fn(),
        };
        return renderHook(() => useWebViewNavigation(host as any)).result;
    };
    const report = (data: { canGoBack: boolean; includesHistory?: boolean }) =>
        act(() => {
            handlers.SetCanGoBack({ type: 'SetCanGoBack', data });
        });

    beforeEach(() => {
        mockPlatformOS = 'android';
        mockOnBackPress = undefined;
        mockSubView = null;
    });

    it("leaves the press to the app on the page's first screen even when the WebView has history", () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(true));

        report({ canGoBack: false, includesHistory: true });

        expect(mockOnBackPress?.()).toBe(false);
        expect(pushEvent).not.toHaveBeenCalled();
    });

    it('sends the press to the page on a pushed screen even when the WebView reports no history', () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(false));

        report({ canGoBack: true, includesHistory: true });

        expect(mockOnBackPress?.()).toBe(true);
        expect(pushedEvents(pushEvent)).toEqual([expect.objectContaining({ type: 'OnBackPressed' })]);
    });

    it("forgets the page's report when the page goes away", () => {
        const result = mount();
        report({ canGoBack: true, includesHistory: true });
        expect(mockOnBackPress?.()).toBe(true);

        act(() => result.current.forgetPageReport());

        expect(mockOnBackPress?.()).toBe(false);
        act(() => result.current.setNavCanGoBack(true));
        expect(mockOnBackPress?.()).toBe(true);
    });

    it('arms the press for React Native while a sub WebView shows, whatever the page says', () => {
        const { BackNavigationBridge } = jest.requireMock('../../bridge');
        mount();
        report({ canGoBack: false, includesHistory: true });
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(false);

        mockSubView = { viewId: 'view-1' };
        act(() => mockSubViewListener?.());
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(true);
        expect(mockOnBackPress?.()).toBe(false);

        mockSubView = null;
        act(() => mockSubViewListener?.());
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(false);
    });

    it("goes back to adding the WebView's history when a later report comes from an older page", () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(true));
        report({ canGoBack: false, includesHistory: true });
        expect(mockOnBackPress?.()).toBe(false);

        report({ canGoBack: false });

        expect(mockOnBackPress?.()).toBe(true);
    });
});
