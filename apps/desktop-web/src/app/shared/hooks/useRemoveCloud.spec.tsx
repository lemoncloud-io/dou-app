import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const releaseCloud = vi.hoisted(() => vi.fn());
const cacheDelete = vi.hoisted(() => vi.fn());
const refetchClouds = vi.hoisted(() => vi.fn());

vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => ({ cloud: { releaseCloud, cacheDelete } }) } },
}));
vi.mock('./useCloudCatalog', () => ({ useCloudSessionCatalog: () => ({ refetchClouds }) }));
vi.mock('../stores', () => ({
    useJoinedCloudsStore: (selector: (state: { removeJoinedCloud: () => void }) => unknown) =>
        selector({ removeJoinedCloud: vi.fn() }),
}));

import { deleteCauseKey, isCloudAlreadyGone, useRemoveCloud } from './useRemoveCloud';

// The text the backend sends for a release it refuses.
const ALREADY_EXPIRED = '409 CONFLICT - already expired @releaseCloud(clouds/1000001)';
const NOT_OWNER = '403 FORBIDDEN - not owner of cloud @releaseCloud(clouds/1000001)';
const NOT_FOUND = '404 NOT FOUND - not found cloud @releaseCloud(clouds/1000001)';

beforeEach(() => {
    vi.clearAllMocks();
    cacheDelete.mockResolvedValue(undefined);
    refetchClouds.mockResolvedValue(undefined);
});

describe('what a failed delete means', () => {
    // `classifyWireError` calls an already-released cloud "expired"; the switch flow words that as
    // "you no longer have access", which would be the wrong thing to tell someone deleting it.
    it('treats a cloud that is already expired or gone as gone, not as refused', () => {
        expect(isCloudAlreadyGone(new Error(ALREADY_EXPIRED))).toBe(true);
        expect(isCloudAlreadyGone(new Error(NOT_FOUND))).toBe(true);
        expect(isCloudAlreadyGone(new Error(NOT_OWNER))).toBe(false);
        expect(isCloudAlreadyGone(new Error('Network Error'))).toBe(false);
        // Something else the backend could not find is not this cloud being gone.
        expect(isCloudAlreadyGone(new Error('404 NOT FOUND - not found user @releaseCloud(clouds/1)'))).toBe(false);
        // A route that is not there is a failure too, not a cloud that is gone.
        expect(isCloudAlreadyGone(new Error('Request failed with status code 404'))).toBe(false);
        // An expired session is a failure to report, not a cloud that is gone.
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

    // A retry of "already expired" can only fail the same way; the list is what is out of date.
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
