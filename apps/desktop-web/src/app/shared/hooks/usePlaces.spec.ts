import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const mockObserveList = vi.fn();
let mockCloudId = 'cloud-A';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ place: { observeList: mockObserveList } }) },
        session: {
            useGlobalSession: () => ({
                activeServer: { kind: 'cloud', cloudId: mockCloudId },
                identity: { userId: 'u1' },
            }),
        },
    },
}));

import { usePlaces } from './usePlaces';

/** Emits `rows` from the cache, each stamped with the cloud they belong to. */
const emit = (rows: Array<{ id: string; cid: string }>) =>
    mockObserveList.mockImplementation((_query: unknown, cb: (r: { list: unknown[] }) => void) => {
        cb({ list: rows });
        return () => undefined;
    });

describe('usePlaces', () => {
    beforeEach(() => {
        mockObserveList.mockReset();
        mockCloudId = 'cloud-A';
    });

    it("never hands out the previous cloud's rows, not even in the render where the cloud moves", () => {
        // The new cloud's socket is already up with a background session per cloud, so a place
        // auto-selected from a stale list would reach it at once.
        emit([{ id: 'a1', cid: 'cloud-A' }]);
        const seen: string[][] = [];
        const { rerender } = renderHook(() => {
            const result = usePlaces();
            seen.push(result.places.map(place => place.id));
            return result;
        });
        expect(seen.at(-1)).toEqual(['a1']);
        const before = seen.length;

        mockCloudId = 'cloud-B';
        emit([{ id: 'b1', cid: 'cloud-B' }]);
        rerender();

        const afterSwitch = seen.slice(before);
        expect(afterSwitch.every(ids => !ids.includes('a1'))).toBe(true);
        expect(afterSwitch.at(-1)).toEqual(['b1']);
    });
});
