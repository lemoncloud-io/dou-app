import { renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

const cacheWriteManyMock = jest.fn();
let mockSelectedCloudId = 'default';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        session: {
            useSessionSelection: jest.fn(),
        },
    },
}));

import { useInviteDismissMigration } from './useInviteDismissMigration';

const FLAG_KEY = 'chatic-invite-dismiss-migrated';
const LEGACY_KEY = 'dou.relayInvite.locallyCanceled.v1';

describe('useInviteDismissMigration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        mockSelectedCloudId = 'default';
        cacheWriteManyMock.mockResolvedValue(undefined);
        (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
            invite: { cacheWriteMany: cacheWriteManyMock },
        });
        (runtime.session.useSessionSelection as jest.Mock).mockImplementation(() => ({
            selectedCloudId: mockSelectedCloudId,
        }));
    });

    it('레거시 기록이 없으면 아무것도 쓰지 않고 즉시 완료로 표시한다', async () => {
        renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(window.localStorage.getItem(FLAG_KEY)).toBe('1'));
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
    });

    it('레거시 기록이 있으면 dismissedAt 스텁으로 캐시에 쓰고 레거시 키를 지운다', async () => {
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify(['invite-1', 'invite-2']));

        renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(cacheWriteManyMock).toHaveBeenCalledTimes(1));
        const [written] = cacheWriteManyMock.mock.calls[0];
        expect(written).toEqual([
            { id: 'invite-1', dismissedAt: expect.any(Number) },
            { id: 'invite-2', dismissedAt: expect.any(Number) },
        ]);
        await waitFor(() => expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull());
        await waitFor(() => expect(window.localStorage.getItem(FLAG_KEY)).toBe('1'));
    });

    it('기본 클라우드가 아니면 기록이 있어도 미룬다 — 다른 파티션에 쓰면 조용히 사라진다', async () => {
        mockSelectedCloudId = 'cloud-a';
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify(['invite-1']));

        renderHook(() => useInviteDismissMigration());

        // Give any stray async work a tick, then confirm nothing happened.
        await Promise.resolve();
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(FLAG_KEY)).toBeNull();
        expect(window.localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    });

    it('쓰기 실패는 플래그를 세우지 않아 다음 부팅(재마운트)에 재시도한다', async () => {
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify(['invite-1']));
        cacheWriteManyMock.mockRejectedValueOnce(new Error('offline'));

        const { unmount } = renderHook(() => useInviteDismissMigration());

        await waitFor(() => expect(cacheWriteManyMock).toHaveBeenCalledTimes(1));
        expect(window.localStorage.getItem(FLAG_KEY)).toBeNull();
        expect(window.localStorage.getItem(LEGACY_KEY)).not.toBeNull();
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
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify(['invite-1']));

        renderHook(() => useInviteDismissMigration());

        await Promise.resolve();
        expect(cacheWriteManyMock).not.toHaveBeenCalled();
    });
});
