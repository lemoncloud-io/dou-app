import { act, renderHook, waitFor } from '@testing-library/react';

import { useChatSync, useSyncTarget } from './useSyncTarget';

const mockDispose = jest.fn();
const mockRegister = jest.fn().mockReturnValue(mockDispose);
const mockUpdateLocalSnapshot = jest.fn();
jest.mock('../runtime', () => ({
    getSyncManager: () => ({ register: mockRegister, updateLocalSnapshot: mockUpdateLocalSnapshot }),
}));

// Mutable so each test can flip a slot's auth state; useChatSync's prime is gated on it.
let verifiedSlots: Set<string> = new Set();
jest.mock('../../../connection/hooks/useSlotVerified', () => ({
    useSlotVerified: (slot: string) => verifiedSlots.has(slot),
}));

// The session readers: the selected cloud, and the uid this account has in each cloud. A test that
// changes either assigns here and calls `emitSession`, which is what the session signal does.
let mockSelectedCloudId: string | null = 'default';
let mockUids: Record<string, string | null> = {};
let sessionListeners: Array<() => void> = [];
const emitSession = () => act(() => sessionListeners.forEach(listener => listener()));
jest.mock('../../../session/hooks/session/readers/useSessionSelection', () => {
    const { useSyncExternalStore } = jest.requireActual('react');
    return {
        useSessionSelection: () => ({
            selectedCloudId: useSyncExternalStore(
                (listener: () => void) => {
                    sessionListeners.push(listener);
                    return () => undefined;
                },
                () => mockSelectedCloudId
            ),
        }),
    };
});
jest.mock('../../../session/store', () => ({
    getUidInCloud: (cid: string) => mockUids[cid] ?? null,
    subscribeSessionSignal: (listener: () => void) => {
        sessionListeners.push(listener);
        return () => undefined;
    },
}));

const mockCacheReadList = jest.fn().mockResolvedValue({ list: [] });
const mockRefreshList = jest.fn().mockResolvedValue(undefined);
const mockGetScopedRepositories = jest.fn((_cid: string) => ({
    chat: { cacheReadList: mockCacheReadList, refreshList: mockRefreshList },
}));
jest.mock('../../../data/runtime', () => ({
    getDataManager: () => ({ getScopedRepositories: mockGetScopedRepositories }),
}));

jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn() } }));

beforeEach(() => {
    mockSelectedCloudId = 'default';
    mockUids = { default: 'relay-uid', 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' };
    sessionListeners = [];
});

describe('useSyncTarget', () => {
    beforeEach(() => {
        verifiedSlots = new Set(); // keep prime dormant so register behavior is isolated
        mockRegister.mockClear();
        mockDispose.mockClear();
    });

    it('registers under the selected cloud on mount and disposes on unmount', () => {
        mockSelectedCloudId = 'cloud-a';
        const { unmount } = renderHook(() => useSyncTarget({ type: 'chat', id: 'ch-1' }));
        expect(mockRegister).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' }, { cid: 'cloud-a' });

        unmount();
        expect(mockDispose).toHaveBeenCalledTimes(1);
    });

    it('registers under the cloud it is given, whatever is selected', () => {
        renderHook(() => useSyncTarget({ type: 'place', id: 'site-1' }, 'cloud-b'));

        expect(mockRegister).toHaveBeenCalledWith({ type: 'place', id: 'site-1' }, { cid: 'cloud-b' });
    });

    it('treats an empty selection as the relay', () => {
        mockSelectedCloudId = '';
        renderHook(() => useSyncTarget({ type: 'channel', id: 'ch-1' }));

        expect(mockRegister).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' }, { cid: 'default' });
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
        expect(mockRegister).toHaveBeenLastCalledWith({ type: 'chat', id: 'ch-2' }, { cid: 'default' });
    });

    // A mounted component renders the next cloud's rows after a switch, so its target follows.
    it('re-registers under the next cloud when the selection changes', () => {
        mockSelectedCloudId = 'cloud-a';
        renderHook(() => useSyncTarget({ type: 'channel', id: 'ch-1' }));

        mockSelectedCloudId = 'cloud-b';
        emitSession();

        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockRegister).toHaveBeenLastCalledWith({ type: 'channel', id: 'ch-1' }, { cid: 'cloud-b' });
    });

    it("re-registers when this account's uid in the target's cloud changes", () => {
        mockSelectedCloudId = 'cloud-a';
        renderHook(() => useSyncTarget({ type: 'join', id: 'ch-1@uid-a' }));

        mockUids = { ...mockUids, 'cloud-a': 'uid-a-2' };
        emitSession();

        expect(mockRegister).toHaveBeenCalledTimes(2);
    });

    it("leaves the registration alone when only another cloud's uid changes", () => {
        mockSelectedCloudId = 'cloud-a';
        renderHook(() => useSyncTarget({ type: 'channel', id: 'ch-1' }));

        mockUids = { ...mockUids, default: 'relay-uid-2' };
        emitSession();

        expect(mockRegister).toHaveBeenCalledTimes(1);
        expect(mockDispose).not.toHaveBeenCalled();
    });
});

describe('useChatSync — prime', () => {
    beforeEach(() => {
        verifiedSlots = new Set(['default']);
        mockRegister.mockClear();
        mockDispose.mockClear();
        mockUpdateLocalSnapshot.mockClear();
        mockGetScopedRepositories.mockClear();
        mockCacheReadList.mockClear().mockResolvedValue({ list: [] });
        mockRefreshList.mockClear().mockResolvedValue(undefined);
    });

    it('빈 캐시면 baseline 0으로 정렬하고 첫 페이지를 fetch한다', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });
        renderHook(() => useChatSync('ch-1'));

        await waitFor(() =>
            expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 0, minNo: 0, messages: [] },
                { cid: 'default' }
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
                { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] },
                { cid: 'default' }
            )
        );
        expect(mockRefreshList).not.toHaveBeenCalled();
    });

    it('미인증이면 prime하지 않는다', async () => {
        verifiedSlots = new Set();
        renderHook(() => useChatSync('ch-1'));

        // Let any (skipped) effect microtask settle — nothing should touch the cache/baseline.
        await act(async () => {
            await Promise.resolve();
        });
        expect(mockCacheReadList).not.toHaveBeenCalled();
        expect(mockUpdateLocalSnapshot).not.toHaveBeenCalled();
        expect(mockRefreshList).not.toHaveBeenCalled();
    });

    it("primes through the target cloud's own graph and runtime", async () => {
        mockSelectedCloudId = 'cloud-a';
        verifiedSlots = new Set(['cloud-a']);
        renderHook(() => useChatSync('ch-1'));

        await waitFor(() => expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' }));
        expect(mockGetScopedRepositories).toHaveBeenCalledWith('cloud-a');
        expect(mockUpdateLocalSnapshot).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' }, expect.anything(), {
            cid: 'cloud-a',
        });
    });

    // The active slot being verified says nothing about the slot this room's cloud is served by.
    it("waits for the target cloud's slot, not whichever slot is verified", async () => {
        mockSelectedCloudId = 'cloud-a';
        verifiedSlots = new Set(['default']);
        renderHook(() => useChatSync('ch-1'));

        await act(async () => {
            await Promise.resolve();
        });
        expect(mockCacheReadList).not.toHaveBeenCalled();
    });
});
