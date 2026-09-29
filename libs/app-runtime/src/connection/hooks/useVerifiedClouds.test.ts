import { act, renderHook } from '@testing-library/react';

import { useVerifiedClouds } from './useVerifiedClouds';

/**
 * A manager with just the four reads the hook makes. Teardown announces the slot while it is still
 * bound and removes it afterwards, the order SocketManager.teardownEntry uses.
 */
const createFakeManager = () => {
    const bound = new Map<string, boolean>();
    const clientListeners = new Set<(key: string, client: object | null) => void>();
    const verifiedListeners = new Set<(key: string) => void>();
    return {
        getSlotKeys: () => [...bound.keys()],
        isSlotVerified: (key: string) => bound.get(key) === true,
        subscribeSlotClients: (listener: (key: string, client: object | null) => void) => {
            clientListeners.add(listener);
            for (const key of bound.keys()) listener(key, {});
            return () => clientListeners.delete(listener);
        },
        subscribeSlotVerified: (key: string, listener: (verified: boolean) => void) => {
            const onChange = (changed: string) => changed === key && listener(bound.get(key) === true);
            verifiedListeners.add(onChange);
            listener(bound.get(key) === true);
            return () => verifiedListeners.delete(onChange);
        },
        bind(key: string, verified = false) {
            bound.set(key, verified);
            clientListeners.forEach(listener => listener(key, {}));
        },
        setVerified(key: string, verified: boolean) {
            bound.set(key, verified);
            verifiedListeners.forEach(listener => listener(key));
        },
        tearDown(key: string) {
            clientListeners.forEach(listener => listener(key, null));
            bound.delete(key);
        },
    };
};

let mockManager = createFakeManager();
jest.mock('../../socket/runtime', () => ({ getSocketManager: () => mockManager }));

beforeEach(() => {
    mockManager = createFakeManager();
});

describe('useVerifiedClouds', () => {
    it('lists the bound slots that are verified, leaving out the ones still handshaking', () => {
        mockManager.bind('default', true);
        mockManager.bind('cloud-a', false);

        const { result } = renderHook(() => useVerifiedClouds());

        expect(result.current).toEqual(['default']);
    });

    it('follows a slot that binds and then verifies after the hook mounted', () => {
        const { result } = renderHook(() => useVerifiedClouds());

        act(() => mockManager.bind('cloud-a'));
        expect(result.current).toEqual([]);

        act(() => mockManager.setVerified('cloud-a', true));
        expect(result.current).toEqual(['cloud-a']);
    });

    it('drops a slot once its teardown has finished', async () => {
        mockManager.bind('cloud-a', true);
        const { result } = renderHook(() => useVerifiedClouds());

        await act(async () => {
            mockManager.tearDown('cloud-a');
            await Promise.resolve();
        });

        expect(result.current).toEqual([]);
    });

    it('keeps the same array while the set is unchanged', () => {
        mockManager.bind('cloud-a', true);
        const { result, rerender } = renderHook(() => useVerifiedClouds());
        const first = result.current;

        act(() => mockManager.setVerified('cloud-a', true));
        rerender();

        expect(result.current).toBe(first);
    });
});
