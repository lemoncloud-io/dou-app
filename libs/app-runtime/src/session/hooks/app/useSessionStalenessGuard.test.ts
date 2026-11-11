import { renderHook } from '@testing-library/react';

import type { RuntimeEngine } from '@chatic/runtime-core';

import { useSessionStalenessGuard } from './useSessionStalenessGuard';
import { initAppRuntime, resetRuntimeEngine } from '../../../init';

const mockStop = jest.fn();
const mockStart = jest.fn(() => mockStop);
const mockCheck = jest.fn(() => Promise.resolve());
const mockSetPolicy = jest.fn();
const mockConstruct = jest.fn();

// A fake engine: what this hook is about is asking the engine for its guard, not making one itself.
beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({
        relayCredentialGuard: (policy: unknown) => {
            mockConstruct(policy);
            return { start: mockStart, check: mockCheck, setPolicy: mockSetPolicy };
        },
    } as unknown as RuntimeEngine);
});
afterEach(() => resetRuntimeEngine());

describe('useSessionStalenessGuard', () => {
    it('starts one guard on mount and stops it on unmount', () => {
        const { unmount } = renderHook(() => useSessionStalenessGuard({ intervalMs: null }));

        expect(mockConstruct).toHaveBeenCalledTimes(1);
        expect(mockStart).toHaveBeenCalledTimes(1);

        unmount();
        expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('re-arms the triggers when they change, keeping the same guard', () => {
        const { rerender } = renderHook(({ enabled }) => useSessionStalenessGuard({ enabled, intervalMs: null }), {
            initialProps: { enabled: false },
        });

        rerender({ enabled: true });

        expect(mockConstruct).toHaveBeenCalledTimes(1);
        expect(mockStart).toHaveBeenCalledTimes(2);
        expect(mockStop).toHaveBeenCalledTimes(1);
        expect(mockSetPolicy).toHaveBeenLastCalledWith({ enabled: true, intervalMs: null });
    });

    it('does not re-arm on a re-render whose triggers did not change', () => {
        const { rerender } = renderHook(() => useSessionStalenessGuard({ intervalMs: null, forceRefresh: true }));

        rerender();

        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('hands back a stable check that runs the guard', async () => {
        const { result, rerender } = renderHook(() => useSessionStalenessGuard({ intervalMs: null }));
        const first = result.current.check;

        rerender();
        await result.current.check();

        expect(result.current.check).toBe(first);
        expect(mockCheck).toHaveBeenCalledTimes(1);
    });

    it('hands the guard its policy before it starts it', () => {
        renderHook(() => useSessionStalenessGuard({}));

        expect(mockSetPolicy.mock.invocationCallOrder[0]).toBeLessThan(mockStart.mock.invocationCallOrder[0]);
    });
});
