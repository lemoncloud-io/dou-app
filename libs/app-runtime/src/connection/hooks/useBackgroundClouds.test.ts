import { renderHook } from '@testing-library/react';

import { backgroundClouds, resetBackgroundClouds } from '../../socket/backgroundClouds';
import { useBackgroundClouds } from './useBackgroundClouds';

describe('useBackgroundClouds', () => {
    beforeEach(() => resetBackgroundClouds());

    it('hands the app list to the runtime', () => {
        renderHook(() => useBackgroundClouds(['a', 'b']));

        expect(backgroundClouds.getJoined()).toEqual(['a', 'b']);
    });

    it('moves straight to a changed list, without passing through an empty one', () => {
        const seen: Array<readonly string[]> = [];
        backgroundClouds.subscribe(() => seen.push(backgroundClouds.getJoined()));
        const { rerender } = renderHook(({ cids }) => useBackgroundClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });

        rerender({ cids: ['a', 'b'] });

        expect(seen).toEqual([['a'], ['a', 'b']]);
    });

    it('does not announce a fresh array with the same content', () => {
        const { rerender } = renderHook(({ cids }) => useBackgroundClouds(cids), {
            initialProps: { cids: ['a'] as readonly string[] },
        });
        const listener = jest.fn();
        backgroundClouds.subscribe(listener);

        rerender({ cids: ['a'] });

        expect(listener).not.toHaveBeenCalled();
    });

    it('withdraws the list on unmount', () => {
        const { unmount } = renderHook(() => useBackgroundClouds(['a']));

        unmount();

        expect(backgroundClouds.getJoined()).toEqual([]);
    });

    it('an empty list is an empty list, not one empty id', () => {
        renderHook(() => useBackgroundClouds([]));

        expect(backgroundClouds.getJoined()).toEqual([]);
    });
});
