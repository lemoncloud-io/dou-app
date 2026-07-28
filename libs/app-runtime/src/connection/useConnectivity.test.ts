import { act, renderHook } from '@testing-library/react';

import { deriveConnectivity, useConnectivity } from './useConnectivity';
import { useRuntimeSocketState } from '../runtime/useRuntimeSocketState';

jest.mock('../runtime/useRuntimeSocketState', () => ({ useRuntimeSocketState: jest.fn() }));

const mockedSocketState = useRuntimeSocketState as jest.MockedFunction<typeof useRuntimeSocketState>;

const socket = (over: Partial<ReturnType<typeof useRuntimeSocketState>> = {}) => ({
    state: 'connected' as const,
    isConnected: true,
    isVerified: true,
    connectionId: 'conn-1',
    ...over,
});

const setBrowserOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

describe('deriveConnectivity', () => {
    // navigator.onLine is a RELIABLE NEGATIVE: false proves there is no network, so it wins
    // over every socket state — including a socket still sitting in 'connected' because no
    // frame has failed yet.
    it.each([
        ['connected', true, true],
        ['connecting', false, false],
        ['closed', false, false],
        ['idle', false, false],
    ] as const)('reports offline when the browser is offline (socket %s)', (state, isConnected, isVerified) => {
        expect(deriveConnectivity({ isBrowserOnline: false, state, isConnected, isVerified })).toBe('offline');
    });

    // ...and an UNRELIABLE POSITIVE: true only proves an interface is up, never reachability,
    // so on its own it never reports a healthy connection.
    it.each([
        ['connecting', false, false],
        ['closing', false, false],
    ] as const)('reports reconnecting while the socket is %s and the browser is online', (state, c, v) => {
        expect(deriveConnectivity({ isBrowserOnline: true, state, isConnected: c, isVerified: v })).toBe(
            'reconnecting'
        );
    });

    it('reports reconnecting — not offline — for a closed socket while the browser is online', () => {
        expect(
            deriveConnectivity({ isBrowserOnline: true, state: 'closed', isConnected: false, isVerified: false })
        ).toBe('reconnecting');
    });

    it('reports reconnecting while connected but not yet verified', () => {
        expect(
            deriveConnectivity({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: false })
        ).toBe('reconnecting');
    });

    it('reports online only when the socket is connected AND verified', () => {
        expect(
            deriveConnectivity({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: true })
        ).toBe('online');
    });

    it('stays quiet on the pre-connect idle boot state', () => {
        expect(
            deriveConnectivity({ isBrowserOnline: true, state: 'idle', isConnected: false, isVerified: false })
        ).toBe('online');
    });
});

describe('useConnectivity', () => {
    beforeEach(() => {
        mockedSocketState.mockReturnValue(socket());
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    });

    it('flips to offline when the browser fires the offline event', () => {
        const { result } = renderHook(() => useConnectivity());
        expect(result.current).toBe('online');

        act(() => setBrowserOnline(false));
        expect(result.current).toBe('offline');
    });

    it('leaves offline when the browser comes back, deferring to the socket state', () => {
        mockedSocketState.mockReturnValue(socket({ state: 'connecting', isConnected: false, isVerified: false }));
        const { result } = renderHook(() => useConnectivity());

        act(() => setBrowserOnline(false));
        expect(result.current).toBe('offline');

        act(() => setBrowserOnline(true));
        expect(result.current).toBe('reconnecting');
    });

    it('unsubscribes from the window events on unmount', () => {
        const removeSpy = jest.spyOn(window, 'removeEventListener');
        const { unmount } = renderHook(() => useConnectivity());
        unmount();

        expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
        removeSpy.mockRestore();
    });
});
