import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const releaseCloud = vi.hoisted(() => vi.fn());
const cacheDelete = vi.hoisted(() => vi.fn());
const refetchClouds = vi.hoisted(() => vi.fn());

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({ cloud: { releaseCloud, cacheDelete } }) },
    })
);
vi.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ refetchClouds }) }));
vi.mock('../stores', () => ({
    useJoinedCloudsStore: (selector: (state: { removeJoinedCloud: () => void }) => unknown) =>
        selector({ removeJoinedCloud: vi.fn() }),
}));

import { deleteCauseKey, isCloudAlreadyGone, useRemoveCloud } from './useRemoveCloud';

const ALREADY_EXPIRED = '409 CONFLICT - already expired @releaseCloud(clouds/1000001)';
const NOT_OWNER = '403 FORBIDDEN - not owner of cloud @releaseCloud(clouds/1000001)';
const NOT_FOUND = '404 NOT FOUND - not found cloud @releaseCloud(clouds/1000001)';

beforeEach(() => {
    vi.clearAllMocks();
    cacheDelete.mockResolvedValue(undefined);
    refetchClouds.mockResolvedValue(undefined);
});

describe('what a failed delete means', () => {
    it('treats a cloud that is already expired or gone as gone, not as refused', () => {
        expect(isCloudAlreadyGone(new Error(ALREADY_EXPIRED))).toBe(true);
        expect(isCloudAlreadyGone(new Error(NOT_FOUND))).toBe(true);
        expect(isCloudAlreadyGone(new Error(NOT_OWNER))).toBe(false);
        expect(isCloudAlreadyGone(new Error('Network Error'))).toBe(false);
        expect(isCloudAlreadyGone(new Error('404 NOT FOUND - not found user @releaseCloud(clouds/1)'))).toBe(false);
        expect(isCloudAlreadyGone(new Error('Request failed with status code 404'))).toBe(false);
        expect(isCloudAlreadyGone(new Error('401 UNAUTHORIZED - token expired'))).toBe(false);
    });

    it('says why a delete was refused, by the wire text', () => {
        expect(deleteCauseKey(new Error(NOT_OWNER))).toBe('cloud.deleteCause.denied');
        expect(deleteCauseKey(new Error('Network Error'))).toBe('cloud.deleteCause.network');
        expect(deleteCauseKey(new Error('500 INTERNAL SERVER ERROR'))).toBe('cloud.deleteCause.other');
    });
});

describe('deleteOwnedCloud', () => {
    it('deletes, forgets the cache row and refreshes the list', async () => {
        releaseCloud.mockResolvedValue({});
        const { result } = renderHook(() => useRemoveCloud());

        await expect(act(() => result.current.deleteOwnedCloud('1000001'))).resolves.toBe('deleted');
        expect(releaseCloud).toHaveBeenCalledWith('1000001', { cascade: true });
        expect(cacheDelete).toHaveBeenCalledWith('1000001');
        expect(refetchClouds).toHaveBeenCalled();
    });

    it('refreshes the list and reports a cloud that was already released', async () => {
        releaseCloud.mockRejectedValue(new Error(ALREADY_EXPIRED));
        const { result } = renderHook(() => useRemoveCloud());

        await expect(act(() => result.current.deleteOwnedCloud('1000001'))).resolves.toBe('already-gone');
        expect(refetchClouds).toHaveBeenCalled();
    });

    it('throws a refusal and leaves the list as it is', async () => {
        releaseCloud.mockRejectedValue(new Error(NOT_OWNER));
        const { result } = renderHook(() => useRemoveCloud());

        await expect(act(() => result.current.deleteOwnedCloud('1000001'))).rejects.toThrow('not owner');
        expect(refetchClouds).not.toHaveBeenCalled();
        expect(result.current.isDeleting).toBe(false);
    });
});
