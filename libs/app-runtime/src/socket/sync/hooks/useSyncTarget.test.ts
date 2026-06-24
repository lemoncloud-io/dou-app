import { renderHook, waitFor } from '@testing-library/react';

import { useChatSync, useJoinSync, useProfileSync, useSyncTarget } from './useSyncTarget';

const mockDispose = jest.fn();
const mockRegister = jest.fn().mockReturnValue(mockDispose);
const mockJoinDispose = jest.fn();
const mockRegisterJoin = jest.fn().mockReturnValue(mockJoinDispose);
jest.mock('../../runtime', () => ({
    getSyncManager: () => ({ register: mockRegister, registerJoin: mockRegisterJoin }),
}));

const mockCacheReadList = jest.fn();
const mockJoinRefreshList = jest.fn().mockResolvedValue(undefined);
let mockUid = 'me';
jest.mock('../../../data/runtime', () => ({
    getRepositories: () => ({ join: { cacheReadList: mockCacheReadList, refreshList: mockJoinRefreshList } }),
    getDataManager: () => ({ getContext: () => ({ uid: mockUid }) }),
}));

describe('useSyncTarget', () => {
    beforeEach(() => {
        mockRegister.mockClear();
        mockDispose.mockClear();
    });

    it('registers on mount and disposes on unmount', () => {
        const { unmount } = renderHook(() => useSyncTarget({ type: 'chat', id: 'ch-1' }));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        unmount();
        expect(mockDispose).toHaveBeenCalledTimes(1);
    });

    it('does not register a null target', () => {
        renderHook(() => useSyncTarget(null));
        expect(mockRegister).not.toHaveBeenCalled();
    });

    it('re-registers only when the target key changes', () => {
        const { rerender } = renderHook(({ id }: { id: string }) => useChatSync(id), {
            initialProps: { id: 'ch-1' },
        });
        expect(mockRegister).toHaveBeenCalledTimes(1);

        rerender({ id: 'ch-1' }); // same key — no re-register
        expect(mockRegister).toHaveBeenCalledTimes(1);

        rerender({ id: 'ch-2' }); // key change — dispose old, register new
        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockRegister).toHaveBeenCalledTimes(2);
        expect(mockRegister).toHaveBeenLastCalledWith({ type: 'chat', id: 'ch-2' });
    });
});

describe('useProfileSync', () => {
    beforeEach(() => {
        mockRegister.mockClear();
    });

    it('registers a profile target when an id is given', () => {
        renderHook(() => useProfileSync('site-1:me'));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'profile', id: 'site-1:me' });
    });

    it('does not register when the id is missing', () => {
        renderHook(() => useProfileSync(undefined));
        expect(mockRegister).not.toHaveBeenCalled();
    });
});

describe('useJoinSync', () => {
    beforeEach(() => {
        mockRegisterJoin.mockClear();
        mockJoinDispose.mockClear();
        mockJoinRefreshList.mockClear();
        mockCacheReadList.mockReset();
        mockUid = 'me';
    });

    it('registers the cached joinId for the current user (cache hit, no refresh)', async () => {
        mockCacheReadList.mockResolvedValue({
            list: [
                { id: 'j-other', userId: 'other' },
                { id: 'j-1', userId: 'me' },
            ],
        });

        renderHook(() => useJoinSync('ch-1'));

        await waitFor(() => expect(mockRegisterJoin).toHaveBeenCalledWith('j-1'));
        expect(mockJoinRefreshList).not.toHaveBeenCalled();
    });

    it('warms the cache via refreshList then falls back to the composite id on cache miss', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] }); // miss before and after refresh

        renderHook(() => useJoinSync('ch-1'));

        await waitFor(() => expect(mockRegisterJoin).toHaveBeenCalledWith('ch-1@me'));
        expect(mockJoinRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('does not register when channelId is missing', async () => {
        renderHook(() => useJoinSync(undefined));
        await Promise.resolve();
        expect(mockRegisterJoin).not.toHaveBeenCalled();
    });

    it('disposes the join target on unmount', async () => {
        mockCacheReadList.mockResolvedValue({ list: [{ id: 'j-1', userId: 'me' }] });

        const { unmount } = renderHook(() => useJoinSync('ch-1'));
        await waitFor(() => expect(mockRegisterJoin).toHaveBeenCalled());

        unmount();
        expect(mockJoinDispose).toHaveBeenCalledTimes(1);
    });
});
