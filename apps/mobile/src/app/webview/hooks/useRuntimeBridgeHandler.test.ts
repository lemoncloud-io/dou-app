import { renderHook } from '@testing-library/react';

import { useRuntimeBridgeHandler } from './useRuntimeBridgeHandler';

const mockOwner = jest.fn();
jest.mock('../../services/runtime/launchSessionOwner', () => ({ launchSessionOwner: () => mockOwner() }));
const mockDispose = jest.fn();
const mockCreate = jest.fn(() => ({
    handlers: {
        RuntimeHello: jest.fn(),
        RuntimeCall: jest.fn(),
        RuntimeSubscribe: jest.fn(),
        RuntimeUnsubscribe: jest.fn(),
    },
    dispose: mockDispose,
}));
jest.mock('../../services/runtime/runtimeBridge', () => ({
    createAppRuntimeBridge: (bridge: unknown) => mockCreate(bridge),
}));

const fakeBridge = () => ({ registerHandler: jest.fn(), unregisterHandler: jest.fn() });

describe('useRuntimeBridgeHandler', () => {
    beforeEach(() => jest.clearAllMocks());

    it('registers nothing, and loads nothing, on a launch the page owns', () => {
        mockOwner.mockReturnValue('web');
        const bridge = fakeBridge();

        renderHook(() => useRuntimeBridgeHandler(bridge as never));

        expect(bridge.registerHandler).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("registers the four runtime requests on a launch the app's runtime owns, and takes them back on unmount", () => {
        mockOwner.mockReturnValue('native');
        const bridge = fakeBridge();

        const { unmount } = renderHook(() => useRuntimeBridgeHandler(bridge as never));
        expect(bridge.registerHandler.mock.calls.map(([type]) => type)).toEqual([
            'RuntimeHello',
            'RuntimeCall',
            'RuntimeSubscribe',
            'RuntimeUnsubscribe',
        ]);

        unmount();
        expect(bridge.unregisterHandler).toHaveBeenCalledTimes(4);
        expect(mockDispose).toHaveBeenCalled();
    });
});
