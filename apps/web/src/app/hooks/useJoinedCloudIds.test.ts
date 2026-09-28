import { renderHook } from '@testing-library/react';

import type { DomainCloud } from '@chatic/data';

import { useJoinedCloudIds } from './useJoinedCloudIds';

const cloud = (id: string | undefined) => ({ id }) as DomainCloud;

describe('useJoinedCloudIds', () => {
    it('lists owned clouds first, then invited ones', () => {
        const { result } = renderHook(() => useJoinedCloudIds([cloud('o1'), cloud('o2')], [cloud('i1')]));

        expect(result.current).toEqual(['o1', 'o2', 'i1']);
    });

    it('drops duplicates, empty ids and the relay', () => {
        const { result } = renderHook(() =>
            useJoinedCloudIds([cloud('o1'), cloud(undefined), cloud('default')], [cloud('o1'), cloud('')])
        );

        expect(result.current).toEqual(['o1']);
    });

    it('keeps the same array for the same membership across renders', () => {
        const { result, rerender } = renderHook(({ owned }) => useJoinedCloudIds(owned, []), {
            initialProps: { owned: [cloud('o1')] },
        });
        const first = result.current;

        rerender({ owned: [cloud('o1')] });
        expect(result.current).toBe(first);

        rerender({ owned: [cloud('o1'), cloud('o2')] });
        expect(result.current).toEqual(['o1', 'o2']);
    });

    it('is empty with no clouds', () => {
        const { result } = renderHook(() => useJoinedCloudIds([], []));

        expect(result.current).toEqual([]);
    });
});
