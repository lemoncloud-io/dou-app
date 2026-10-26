import { NativeModules } from 'react-native';

import { DisplayRegionBridge } from './DisplayRegionBridge';

const mockListeners = new Map<string, (payload: unknown) => void>();
const mockStart = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: {},
    NativeEventEmitter: class {
        addListener(event: string, listener: (payload: unknown) => void) {
            mockListeners.set(event, listener);
            return { remove: () => mockListeners.delete(event) };
        }
    },
}));

const emit = (payload: unknown) => mockListeners.get('DisplayRegionDivisionChange')?.(payload);

describe('DisplayRegionBridge.subscribeDivision', () => {
    beforeEach(() => {
        mockListeners.clear();
        mockStart.mockReset();
        NativeModules.DisplayRegion = { start: mockStart, addListener: jest.fn(), removeListeners: jest.fn() };
    });

    it('asks for the current device fold only after it is listening', () => {
        mockStart.mockImplementation(() => expect(mockListeners.size).toBe(1));

        DisplayRegionBridge.subscribeDivision(jest.fn());

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('hands each device fold rect to the listener, and null when it goes away', () => {
        const listener = jest.fn();
        DisplayRegionBridge.subscribeDivision(listener);

        emit({ division: { x: 465, y: 0, width: 21, height: 669 } });
        emit({ division: null });

        expect(listener.mock.calls).toEqual([[{ x: 465, y: 0, width: 21, height: 669 }], [null]]);
    });

    it('reads a malformed device fold payload as no fold rather than a rect of NaN', () => {
        const listener = jest.fn();
        DisplayRegionBridge.subscribeDivision(listener);

        emit({ division: { x: '465', y: 0, width: 21 } });

        expect(listener).toHaveBeenCalledWith(null);
    });

    it('stops listening when unsubscribed', () => {
        const unsubscribe = DisplayRegionBridge.subscribeDivision(jest.fn());

        unsubscribe();

        expect(mockListeners.size).toBe(0);
    });

    it('is a silent no-op without the native module (Android, or a build before the device fold)', () => {
        delete NativeModules.DisplayRegion;
        const listener = jest.fn();

        const unsubscribe = DisplayRegionBridge.subscribeDivision(listener);

        expect(() => unsubscribe()).not.toThrow();
        expect(listener).not.toHaveBeenCalled();
    });
});
