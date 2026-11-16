import { renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';

import { initAppRuntime, resetRuntimeEngine } from '../../init';
import { useReclaimOwnedClouds } from './useReclaimOwnedClouds';

// When to reclaim — on a list change and on each cloud token commit — is the engine's
// (`setOwnedClouds`); what is left here is handing it the lists.
const setOwnedClouds = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, connection: fakeRuntimeConnection({}, { setOwnedClouds }) });
});

afterEach(() => resetRuntimeEngine());

describe('useReclaimOwnedClouds', () => {
    it('hands the owned clouds, and those also cached as invited, to the runtime', () => {
        renderHook(() => useReclaimOwnedClouds(['a', 'b'], ['b']));

        expect(setOwnedClouds).toHaveBeenCalledWith(['a', 'b'], ['b']);
    });

    it('hands them again when either list changes, and not for fresh arrays with the same content', () => {
        const { rerender } = renderHook(({ cids, invited }) => useReclaimOwnedClouds(cids, invited), {
            initialProps: { cids: ['a'] as readonly string[], invited: [] as readonly string[] },
        });

        rerender({ cids: ['a'], invited: [] });
        rerender({ cids: ['a'], invited: ['a'] });
        rerender({ cids: ['a', 'b'], invited: ['a'] });

        expect(setOwnedClouds.mock.calls).toEqual([
            [['a'], []],
            [['a'], ['a']],
            [['a', 'b'], ['a']],
        ]);
    });

    it('withdraws the lists on unmount', () => {
        const { unmount } = renderHook(() => useReclaimOwnedClouds(['a'], []));

        unmount();

        expect(setOwnedClouds).toHaveBeenLastCalledWith([], []);
    });
});
