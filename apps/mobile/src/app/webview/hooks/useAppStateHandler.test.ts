import { act, renderHook } from '@testing-library/react';

import { pushedEventErrors, pushedEvents } from './appEventContract';
import { useAppStateHandler } from './useAppStateHandler';

let mockCurrentState = 'active';
let mockOnChange: ((state: string) => void) | undefined;

jest.mock('react-native', () => ({
    AppState: {
        get currentState() {
            return mockCurrentState;
        },
        addEventListener: jest.fn((event: string, handler: (state: string) => void) => {
            if (event === 'change') mockOnChange = handler;
            return { remove: jest.fn() };
        }),
    },
}));

// The real useAppState over the mocked AppState above: the hooks barrel reaches native modules.
jest.mock('../../hooks', () => jest.requireActual('../../hooks/useAppState'));
jest.mock('../../services', () => ({ logger: { info: jest.fn() } }));

describe('useAppStateHandler', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        mockCurrentState = 'active';
        mockOnChange = undefined;
        bridge = { pushEvent: jest.fn() };
    });

    describe('app → web event contract', () => {
        it("pushes 'OnBackgroundStatusChanged' with the state the app starts in", () => {
            renderHook(() => useAppStateHandler(bridge as any));

            expect(pushedEvents(bridge.pushEvent)).toEqual([
                expect.objectContaining({
                    type: 'OnBackgroundStatusChanged',
                    data: { status: 'active', isForeground: true, isBackground: false },
                }),
            ]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        it("pushes 'OnBackgroundStatusChanged' again on every state change", () => {
            renderHook(() => useAppStateHandler(bridge as any));

            act(() => mockOnChange?.('inactive'));
            act(() => mockOnChange?.('background'));
            act(() => mockOnChange?.('active'));

            expect(pushedEvents(bridge.pushEvent).map(pushed => (pushed as { data: unknown }).data)).toEqual([
                { status: 'active', isForeground: true, isBackground: false },
                { status: 'inactive', isForeground: false, isBackground: false },
                { status: 'background', isForeground: false, isBackground: true },
                { status: 'active', isForeground: true, isBackground: false },
            ]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        // React Native reports `unknown` before it has read the state; the web would read it as a
        // status outside AppBackgroundStatus.
        it('pushes nothing while the state is unknown', () => {
            mockCurrentState = 'unknown';

            renderHook(() => useAppStateHandler(bridge as any));

            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });

        it('pushes nothing without a bridge', () => {
            renderHook(() => useAppStateHandler(null));

            act(() => mockOnChange?.('background'));

            expect(bridge.pushEvent).not.toHaveBeenCalled();
        });
    });
});
