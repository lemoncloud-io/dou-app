import { act, renderHook, waitFor } from '@testing-library/react';

import { useChatSync, useProfileSync, useSyncTarget } from './useSyncTarget';

const mockDispose = jest.fn();
const mockRegister = jest.fn().mockReturnValue(mockDispose);
const mockUpdateLocalSnapshot = jest.fn();
jest.mock('../../runtime', () => ({
    getSyncManager: () => ({ register: mockRegister, updateLocalSnapshot: mockUpdateLocalSnapshot }),
}));

// Mutable so each test can flip auth state; useChatSync's prime is gated on isVerified.
let socketState: { isVerified: boolean } = { isVerified: false };
jest.mock('../../hooks/useSocketState', () => ({ useSocketState: () => socketState }));

const mockCacheReadList = jest.fn().mockResolvedValue({ list: [] });
const mockRefreshList = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../data/runtime', () => ({
    getRepositories: () => ({ chat: { cacheReadList: mockCacheReadList, refreshList: mockRefreshList } }),
}));

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

describe('useSyncTarget', () => {
    beforeEach(() => {
        socketState = { isVerified: false }; // keep prime dormant so register behavior is isolated
        mockRegister.mockClear();
        mockDispose.mockClear();
    });

    it('마운트 시 등록하고 언마운트 시 dispose한다', () => {
        const { unmount } = renderHook(() => useSyncTarget({ type: 'chat', id: 'ch-1' }));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        unmount();
        expect(mockDispose).toHaveBeenCalledTimes(1);
    });

    it('null 타깃은 등록하지 않는다', () => {
        renderHook(() => useSyncTarget(null));
        expect(mockRegister).not.toHaveBeenCalled();
    });

    it('타깃 key가 바뀔 때만 재등록한다', () => {
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

describe('useChatSync — prime', () => {
    beforeEach(() => {
        socketState = { isVerified: true };
        mockRegister.mockClear();
        mockDispose.mockClear();
        mockUpdateLocalSnapshot.mockClear();
        mockCacheReadList.mockClear().mockResolvedValue({ list: [] });
        mockRefreshList.mockClear().mockResolvedValue(undefined);
    });

    it('빈 캐시면 baseline 0으로 정렬하고 첫 페이지를 fetch한다', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });
        renderHook(() => useChatSync('ch-1'));

        await waitFor(() =>
            expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 0, minNo: 0, messages: [] }
            )
        );
        expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('웜 캐시면 max chatNo로 정렬하고 재fetch하지 않는다', async () => {
        mockCacheReadList.mockResolvedValue({ list: [{ chatNo: 5 }, { chatNo: 9 }, { chatNo: 7 }] });
        renderHook(() => useChatSync('ch-1'));

        await waitFor(() =>
            expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
            )
        );
        expect(mockRefreshList).not.toHaveBeenCalled();
    });

    it('미인증이면 prime하지 않는다', async () => {
        socketState = { isVerified: false };
        renderHook(() => useChatSync('ch-1'));

        // Let any (skipped) effect microtask settle — nothing should touch the cache/baseline.
        await act(async () => {
            await Promise.resolve();
        });
        expect(mockCacheReadList).not.toHaveBeenCalled();
        expect(mockUpdateLocalSnapshot).not.toHaveBeenCalled();
        expect(mockRefreshList).not.toHaveBeenCalled();
    });
});

describe('useProfileSync', () => {
    beforeEach(() => {
        socketState = { isVerified: false };
        mockRegister.mockClear();
    });

    it('id가 있으면 profile 타깃을 등록한다', () => {
        renderHook(() => useProfileSync('site-1:me'));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'profile', id: 'site-1:me' });
    });

    it('id가 없으면 등록하지 않는다', () => {
        renderHook(() => useProfileSync(undefined));
        expect(mockRegister).not.toHaveBeenCalled();
    });
});
