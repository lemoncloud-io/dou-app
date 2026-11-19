import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';
import { initAppRuntime, resetRuntimeEngine } from '@chatic/runtime-client';
import { act, renderHook } from '@testing-library/react';

import { useConnectivity } from './useConnectivity';
import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useVerifiedClouds } from './useVerifiedClouds';

jest.mock('./useRuntimeSocketState', () => ({ useRuntimeSocketState: jest.fn() }));
jest.mock('./useVerifiedClouds', () => ({ useVerifiedClouds: jest.fn() }));

const mockedSocketState = useRuntimeSocketState as jest.MockedFunction<typeof useRuntimeSocketState>;
const mockedVerifiedClouds = useVerifiedClouds as jest.MockedFunction<typeof useVerifiedClouds>;

const socket = (over: Partial<ReturnType<typeof useRuntimeSocketState>> = {}) => ({
    state: 'connected' as const,
    isConnected: true,
    isVerified: true,
    connectionId: 'conn-1',
    ...over,
});

// The truth table itself is runtime-client's (`deriveConnectivity`); this is the hook reading the
// engine's online signal and the socket hooks into it.
describe('useConnectivity', () => {
    // The online signal is the engine's — the platform's where the sockets run — read off its snapshot.
    const connection = fakeRuntimeConnection();

    beforeEach(() => {
        mockedSocketState.mockReturnValue(socket());
        mockedVerifiedClouds.mockReturnValue([]);
        connection.set({ online: true });
        initAppRuntime({ ...coreEngine, connection });
    });
    afterEach(() => resetRuntimeEngine());

    it('flips to offline when the engine reports no network and no slot is verified', () => {
        const { result } = renderHook(() => useConnectivity());
        expect(result.current).toBe('online');

        act(() => connection.set({ online: false }));
        expect(result.current).toBe('offline');
    });

    it('stays online while there is no network but a slot is verified', () => {
        mockedVerifiedClouds.mockReturnValue(['relay']);
        const { result } = renderHook(() => useConnectivity());

        act(() => connection.set({ online: false }));
        expect(result.current).toBe('online');
    });

    it('leaves offline when the network comes back, deferring to the socket state', () => {
        mockedSocketState.mockReturnValue(socket({ state: 'connecting', isConnected: false, isVerified: false }));
        const { result } = renderHook(() => useConnectivity());

        act(() => connection.set({ online: false }));
        expect(result.current).toBe('offline');

        act(() => connection.set({ online: true }));
        expect(result.current).toBe('reconnecting');
    });
});
