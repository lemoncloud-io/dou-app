import { renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeRuntimeConnection } from '@chatic/runtime-core/testing/connection';

import { initAppRuntime, resetRuntimeEngine } from '../../init';
import { useBackgroundClouds } from './useBackgroundClouds';

const setBackgroundClouds = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, connection: fakeRuntimeConnection({}, { setBackgroundClouds }) });
});

afterEach(() => resetRuntimeEngine());

describe('useBackgroundClouds', () => {
    it('hands the app list to the runtime', () => {
        renderHook(() => useBackgroundClouds(['a', 'b']));

        expect(setBackgroundClouds).toHaveBeenCalledWith(['a', 'b']);
    });

    it('moves straight to a changed list, without passing through an empty one', () => {
        const { rerender } = renderHook(({ cids }) => useBackgroundClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });

        rerender({ cids: ['a', 'b'] });

        expect(setBackgroundClouds.mock.calls).toEqual([[['a']], [['a', 'b']]]);
    });

    it('does not hand over a fresh array with the same content', () => {
        const { rerender } = renderHook(({ cids }) => useBackgroundClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });
        setBackgroundClouds.mockClear();

        rerender({ cids: ['a'] });

        expect(setBackgroundClouds).not.toHaveBeenCalled();
    });

    it('withdraws the list on unmount', () => {
        const { unmount } = renderHook(() => useBackgroundClouds(['a']));

        unmount();

        expect(setBackgroundClouds).toHaveBeenLastCalledWith([]);
    });

    it('an empty list is an empty list, not one empty id', () => {
        renderHook(() => useBackgroundClouds([]));

        expect(setBackgroundClouds).toHaveBeenCalledWith([]);
    });
});
