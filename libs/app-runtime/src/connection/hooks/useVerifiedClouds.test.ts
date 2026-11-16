import { act, renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';

import { initAppRuntime, resetRuntimeEngine } from '../../init';
import { useCloudVerified } from './useCloudVerified';
import { useRuntimeSocketState } from './useRuntimeSocketState';
import { useSlotVerified } from './useSlotVerified';
import { useVerifiedClouds } from './useVerifiedClouds';

// Which slots are verified, and keeping the list the same array until the set changes, is the engine's
// (runtime-core's runtimeConnection); these read its snapshot for React.
const connection = fakeRuntimeConnection();

beforeEach(() => {
    connection.set({ verifiedSlots: [] });
    initAppRuntime({ ...coreEngine, connection });
});

afterEach(() => resetRuntimeEngine());

describe('the socket readers', () => {
    it('list the verified slots, and follow a change', () => {
        connection.set({ verifiedSlots: ['default'] });
        const { result } = renderHook(() => useVerifiedClouds());
        expect(result.current).toEqual(['default']);

        act(() => connection.set({ verifiedSlots: ['default', 'cloud-a'] }));

        expect(result.current).toEqual(['default', 'cloud-a']);
    });

    it('answer for one slot, and for one cloud — a missing cloud id being the relay', () => {
        connection.set({ verifiedSlots: ['default'] });

        expect(renderHook(() => useSlotVerified('cloud-a' as never)).result.current).toBe(false);
        expect(renderHook(() => useCloudVerified(null)).result.current).toBe(true);

        act(() => connection.set({ verifiedSlots: ['default', 'cloud-a'] }));
        expect(renderHook(() => useCloudVerified('cloud-a')).result.current).toBe(true);
    });

    it('read the active socket', () => {
        const active = { state: 'connected', isConnected: true, isVerified: true, connectionId: 'c-1' } as const;
        connection.set({ active: active as never });

        expect(renderHook(() => useRuntimeSocketState()).result.current).toBe(active);
    });
});
