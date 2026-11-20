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
        // The web reports it can go back through SetCanGoBack; only then is the press the web's.
        it("pushes 'OnBackPressed' and consumes the press while the web can go back", () => {
            renderHook(() => useAndroidBack(bridge as any, true));

            const consumed = mockOnBackPress?.();

            expect(consumed).toBe(true);
            expect(pushedEvents(bridge.pushEvent)).toEqual([expect.objectContaining({ type: 'OnBackPressed' })]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        // Not consumed, so Android runs its default and leaves the app.
        it('pushes nothing and leaves the press to the OS while the web cannot go back', () => {
            renderHook(() => useAndroidBack(bridge as any, false));

            const consumed = mockOnBackPress?.();

            expect(consumed).toBe(false);
            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        // The same rule, reached the way the app reaches it: the web's SetCanGoBack is what arms it.
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

        // The sub WebView's own listener takes the press; this one can sit above it, so it steps aside.
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

    // A current page knows its router index and its overlays; the WebView's history is not asked.
    it("follows a page's whole answer and ignores the WebView's history", () => {
        expect(resolveCanGoBack(page(false, true), true)).toBe(false);
        expect(resolveCanGoBack(page(true, true), false)).toBe(true);
    });

    // A page from before bridge 2.34.0 reports overlays only, so the WebView's history stands in.
    it("adds the WebView's history to an older page's overlay-only answer", () => {
        expect(resolveCanGoBack(page(false, false), true)).toBe(true);
        expect(resolveCanGoBack(page(true, false), false)).toBe(true);
        expect(resolveCanGoBack(page(false, false), false)).toBe(false);
    });
});

describe('nextWebBackReport', () => {
    const last = { canGoBack: true, includesHistory: true };

    // The page reports on every DOM change; the same answer again keeps the same object, so React
    // skips the update instead of rendering the screen again.
    it('keeps the same report for an unchanged answer', () => {
        expect(nextWebBackReport(last, { canGoBack: true, includesHistory: true })).toBe(last);
    });

    it('replaces the report whole when the answer changes', () => {
        expect(nextWebBackReport(last, { canGoBack: false, includesHistory: true })).toEqual({
            canGoBack: false,
            includesHistory: true,
        });
        // An older page's report carries no marker, which reads as false.
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

    // The reported bug: the page is back on its first screen after a sign-in by code, while the
    // WebView's own history still says there is somewhere to go. The press must reach the app's exit
    // handling, not a page that will drop it.
    it("leaves the press to the app on the page's first screen even when the WebView has history", () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(true));

        report({ canGoBack: false, includesHistory: true });

        expect(mockOnBackPress?.()).toBe(false);
        expect(pushEvent).not.toHaveBeenCalled();
    });

    // The other half: on a pushed screen the WebView may report no history at all.
    it('sends the press to the page on a pushed screen even when the WebView reports no history', () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(false));

        report({ canGoBack: true, includesHistory: true });

        expect(mockOnBackPress?.()).toBe(true);
        expect(pushedEvents(pushEvent)).toEqual([expect.objectContaining({ type: 'OnBackPressed' })]);
    });

    // A new document replaces the page that reported; until the next page reports, the WebView's
    // history stands in rather than the old page's answer, which may have been deep in its stack.
    it("forgets the page's report when the page goes away", () => {
        const result = mount();
        report({ canGoBack: true, includesHistory: true });
        expect(mockOnBackPress?.()).toBe(true);

        act(() => result.current.forgetPageReport());

        expect(mockOnBackPress?.()).toBe(false);
        act(() => result.current.setNavCanGoBack(true));
        expect(mockOnBackPress?.()).toBe(true);
    });

    // The sub WebView's own listener is reached only while the press is armed for React Native, and the
    // main page underneath may be on its first screen with nothing to spend.
    it('arms the press for React Native while a sub WebView shows, whatever the page says', () => {
        const { BackNavigationBridge } = jest.requireMock('../../bridge');
        mount();
        report({ canGoBack: false, includesHistory: true });
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(false);

        mockSubView = { viewId: 'view-1' };
        act(() => mockSubViewListener?.());
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(true);
        // The press itself is the sub WebView's; this listener steps aside.
        expect(mockOnBackPress?.()).toBe(false);

        mockSubView = null;
        act(() => mockSubViewListener?.());
        expect(BackNavigationBridge.setCanGoBack).toHaveBeenLastCalledWith(false);
    });

    // A reload into an older build sends no `includesHistory`; its report replaces the newer one whole.
    it("goes back to adding the WebView's history when a later report comes from an older page", () => {
        const result = mount();
        act(() => result.current.setNavCanGoBack(true));
        report({ canGoBack: false, includesHistory: true });
        expect(mockOnBackPress?.()).toBe(false);

        report({ canGoBack: false });

        expect(mockOnBackPress?.()).toBe(true);
    });
});
