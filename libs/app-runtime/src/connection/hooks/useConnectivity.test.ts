import { act, renderHook } from '@testing-library/react';

import { deriveConnectivity, useConnectivity } from './useConnectivity';
import type { ConnectivitySignals } from './useConnectivity';
import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useVerifiedClouds } from './useVerifiedClouds';
import type { SlotKey } from '../../socket/types';

jest.mock('./useRuntimeSocketState', () => ({ useRuntimeSocketState: jest.fn() }));
jest.mock('./useVerifiedClouds', () => ({ useVerifiedClouds: jest.fn() }));

const mockedSocketState = useRuntimeSocketState as jest.MockedFunction<typeof useRuntimeSocketState>;
const mockedVerifiedClouds = useVerifiedClouds as jest.MockedFunction<typeof useVerifiedClouds>;

const socket = (over: Partial<ReturnType<typeof useRuntimeSocketState>> = {}) => ({
    state: 'connected' as const,
    isConnected: true,
    isVerified: true,
    connectionId: 'conn-1',
    activeSlot: 'default' as SlotKey,
    ...over,
});

// `ConnectivitySignals` extends the full `SocketState`, so `connectionId` and `activeSlot` are
// required even though the derivation never reads them. The truth table below is about the signals
// it does read, so both are pinned here instead of repeated on every row — and so is
// `hasVerifiedSocket`, which mirrors the active slot unless a row says otherwise.
const signals = (
    over: Omit<ConnectivitySignals, 'connectionId' | 'activeSlot' | 'hasVerifiedSocket'> & {
        hasVerifiedSocket?: boolean;
    }
): ConnectivitySignals => ({
    connectionId: null,
    activeSlot: null,
    hasVerifiedSocket: over.isConnected && over.isVerified,
    ...over,
});

const setBrowserOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

describe('deriveConnectivity', () => {
    // navigator.onLine is a STRONG NEGATIVE: with no verified socket anywhere, false wins over the
    // active socket's transport state — including a socket still sitting in 'connected' because no
    // frame has failed yet.
    it.each([
        ['connected', true, false],
        ['connecting', false, false],
        ['closed', false, false],
        ['idle', false, false],
    ] as const)(
        'reports offline when the browser is offline and no slot is verified (socket %s)',
        (state, isConnected, isVerified) => {
            expect(deriveConnectivity(signals({ isBrowserOnline: false, state, isConnected, isVerified }))).toBe(
                'offline'
            );
        }
    );

    // ...but not proof: Chromium can latch it at false while the network works, and a verified
    // socket is positive evidence that packets are moving.
    it('reports online when the browser is stuck offline but the active socket is verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: false, state: 'connected', isConnected: true, isVerified: true })
            )
        ).toBe('online');
    });

    it('reports reconnecting, not offline, when the browser is stuck offline and only another slot is verified', () => {
        expect(
            deriveConnectivity(
                signals({
                    isBrowserOnline: false,
                    hasVerifiedSocket: true,
                    state: 'closed',
                    isConnected: false,
                    isVerified: false,
                })
            )
        ).toBe('reconnecting');
    });

    // ...and an UNRELIABLE POSITIVE: true only proves an interface is up, never reachability,
    // so on its own it never reports a healthy connection.
    it.each([
        ['connecting', false, false],
        ['closing', false, false],
    ] as const)('reports reconnecting while the socket is %s and the browser is online', (state, c, v) => {
        expect(deriveConnectivity(signals({ isBrowserOnline: true, state, isConnected: c, isVerified: v }))).toBe(
            'reconnecting'
        );
    });

    it('reports reconnecting — not offline — for a closed socket while the browser is online', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'closed', isConnected: false, isVerified: false })
            )
        ).toBe('reconnecting');
    });

    it('reports reconnecting while connected but not yet verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: false })
            )
        ).toBe('reconnecting');
    });

    it('reports online only when the socket is connected AND verified', () => {
        expect(
            deriveConnectivity(
                signals({ isBrowserOnline: true, state: 'connected', isConnected: true, isVerified: true })
            )
        ).toBe('online');
    });

    it('stays quiet on the pre-connect idle boot state', () => {
        expect(
            deriveConnectivity(signals({ isBrowserOnline: true, state: 'idle', isConnected: false, isVerified: false }))
        ).toBe('online');
    });
});

describe('useConnectivity', () => {
    beforeEach(() => {
        mockedSocketState.mockReturnValue(socket());
        mockedVerifiedClouds.mockReturnValue([]);
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    });

    it('flips to offline when the browser fires the offline event and no slot is verified', () => {
        const { result } = renderHook(() => useConnectivity());
        expect(result.current).toBe('online');

        act(() => setBrowserOnline(false));
        expect(result.current).toBe('offline');
    });

    it('stays online while the browser reports offline but a slot is verified', () => {
        mockedVerifiedClouds.mockReturnValue(['relay']);
        const { result } = renderHook(() => useConnectivity());

        act(() => setBrowserOnline(false));
        expect(result.current).toBe('online');
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
