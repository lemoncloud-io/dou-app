import { act, renderHook } from '@testing-library/react';

import { pushedEventErrors, pushedEvents } from './appEventContract';
import { useAndroidBack } from './useAndroidBack';
import { useWebViewNavigation } from './useWebViewNavigation';

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

describe('useAndroidBack', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        mockPlatformOS = 'android';
        mockOnBackPress = undefined;
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

        it('listens for nothing on iOS, which has no back button', () => {
            mockPlatformOS = 'ios';

            renderHook(() => useAndroidBack(bridge as any, true));

            expect(mockOnBackPress).toBeUndefined();
        });
    });
});
