import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionSelection } from '@chatic/web-core';

const cacheWriteManyMock = jest.fn();
let mockSelectedCloudId = 'default';
let mockCanceledIds: string[] = [];
const clearCanceledMock = jest.fn((id: string) => {
    mockCanceledIds = mockCanceledIds.filter(existing => existing !== id);
});

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionSelection: jest.fn() }));
jest.mock('../../../stores/usePreferenceStore', () => ({
    usePreferenceStore: (selector: (state: unknown) => unknown) =>
        selector({ canceledInviteIds: mockCanceledIds, clearInviteCanceled: clearCanceledMock }),
}));

import { useInviteDismissMigration } from './useInviteDismissMigration';

const FLAG_KEY = 'chatic-invite-dismiss-migrated';

describe('useInviteDismissMigration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockSelectedCloudId = 'default';
        mockCanceledIds = [];
        cacheWriteManyMock.mockResolvedValue(undefined);
        (useRuntimeRepositories as jest.Mock).mockReturnValue({ invite: { cacheWriteMany: cacheWriteManyMock } });
        (useSessionSelection as jest.Mock).mockImplementation(() => ({ selectedCloudId: mockSelectedCloudId }));
    });

    it('레거시 기록이 없으면 아무것도 쓰지 않고 즉시 완료로 표시한다', async () => {
        renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(window.localStorage.getItem(FLAG_KEY)).toBe('1'));
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
    });

    it('레거시 기록이 있으면 dismissedAt 스텁으로 캐시에 쓰고 기록을 비운다', async () => {
        mockCanceledIds = ['invite-1', 'invite-2'];

        renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(cacheWriteManyMock).toHaveBeenCalledTimes(1));
        const [written] = cacheWriteManyMock.mock.calls[0];
        expect(written).toEqual([
            { id: 'invite-1', dismissedAt: expect.any(Number) },
            { id: 'invite-2', dismissedAt: expect.any(Number) },
        ]);
        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invite-1'));
        expect(clearCanceledMock).toHaveBeenCalledWith('invite-2');
        await waitFor(() => expect(window.localStorage.getItem(FLAG_KEY)).toBe('1'));
    });

    it('기본 클라우드가 아니면 기록이 있어도 미룬다 — 다른 파티션에 쓰면 조용히 사라진다', async () => {
        mockSelectedCloudId = 'cloud-a';
        mockCanceledIds = ['invite-1'];

        renderHook(() => useInviteDismissMigration());

        // Give any stray async work a tick, then confirm nothing happened.
        await Promise.resolve();
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(FLAG_KEY)).toBeNull();
    });

    it('쓰기 실패는 플래그를 세우지 않아 다음 부팅(재마운트)에 재시도한다', async () => {
        mockCanceledIds = ['invite-1'];
        cacheWriteManyMock.mockRejectedValueOnce(new Error('offline'));

        const { unmount } = renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(cacheWriteManyMock).toHaveBeenCalledTimes(1));
        expect(window.localStorage.getItem(FLAG_KEY)).toBeNull();
        expect(clearCanceledMock).not.toHaveBeenCalled();
        unmount();

        // A fresh mount is the retry unit here — the flag (not a same-mount ref) is what a real
        // app-reload checks, and this hook's own `startedRef` is per-instance by construction.
        cacheWriteManyMock.mockResolvedValueOnce(undefined);
        renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(cacheWriteManyMock).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(window.localStorage.getItem(FLAG_KEY)).toBe('1'));
    });

    it('이미 마이그레이션된 경우 다시 실행하지 않는다', async () => {
        window.localStorage.setItem(FLAG_KEY, '1');
        mockCanceledIds = ['invite-1'];

        renderHook(() => useInviteDismissMigration());

        await Promise.resolve();
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
    });
});
