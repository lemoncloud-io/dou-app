import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

const cancelInviteMock = jest.fn();
const undismissMock = jest.fn();
const cacheDeleteMock = jest.fn();

let mockInvites: Array<{ id?: string; code?: string; state?: string; dismissedAt?: number }> = [];
let mockIsLoading = false;

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('../../../hooks', () => ({
    useRelayInvites: () => ({ invites: mockInvites, isLoading: mockIsLoading, refetch: jest.fn() }),
    useRelayInviteMutations: () => ({ cancelInvite: cancelInviteMock }),
}));

import { useCanceledInviteReconcile } from './useCanceledInviteReconcile';

describe('useCanceledInviteReconcile — S9 분기 전부', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsLoading = false;
        mockInvites = [];
        cancelInviteMock.mockResolvedValue({ state: 'canceled' });
        (useRuntimeRepositories as jest.Mock).mockReturnValue({
            invite: { undismiss: undismissMock, cacheDelete: cacheDeleteMock },
        });
    });

    it('dismiss된 행이 있고 서버가 아직 pending이면 실제 cancel을 발사하고 dismiss를 해제한다', async () => {
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledWith('invt:invt-1:c0de'));
        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('expired 행도 cancel 대상이다 — 서버 목록 정리', async () => {
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'expired', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalled());
        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('rejected 행의 dismiss는 유지한다 — 정상 상태의 dismiss 마커이지 레거시 기록이 아니다', async () => {
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'rejected', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        // The pass runs asynchronously; give it a tick before asserting nothing happened.
        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(undismissMock).not.toHaveBeenCalled();
        expect(cacheDeleteMock).not.toHaveBeenCalled();
    });

    it.each(['canceled', 'accepted'] as const)('%s 행은 서버가 이미 아는 상태다 — dismiss만 해제한다', async state => {
        mockInvites = [{ id: 'invt-1', code: 'c0de', state, dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
    });

    it('state가 없는 행(마이그레이션 스텁, 서버 응답과 매칭된 적 없음)은 스텁을 통째로 지운다', async () => {
        mockInvites = [
            { id: 'invt-gone', dismissedAt: 1 }, // no state — never matched a server row
            { id: 'invt-1', code: 'c0de', state: 'pending' }, // unrelated, not dismissed
        ];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cacheDeleteMock).toHaveBeenCalledWith('invt-gone'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(undismissMock).not.toHaveBeenCalled();
    });

    it('cancel이 409(이미 수락)로 져도 dismiss는 해제한다 — 더 거둘 것이 없다', async () => {
        cancelInviteMock.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('cancel이 그 외 이유로 지면 dismiss를 남겨 다음 기회에 재시도한다 — 멱등이라 안전', async () => {
        cancelInviteMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalled());
        expect(undismissMock).not.toHaveBeenCalled();
    });

    it('목록 로딩 중에는 돌지 않고, 로딩이 끝난 뒤 한 번만 돈다', async () => {
        mockIsLoading = true;
        mockInvites = [];

        const { rerender } = renderHook(() => useCanceledInviteReconcile());
        expect(cancelInviteMock).not.toHaveBeenCalled();

        mockIsLoading = false;
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending', dismissedAt: 1 }];
        rerender();

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));

        // A later list refresh must not replay the pass in the same mount.
        mockInvites = [
            { id: 'invt-1', code: 'c0de', state: 'pending', dismissedAt: 1 },
            { id: 'invt-2', code: 'x', state: 'pending', dismissedAt: 1 },
        ];
        rerender();
        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));
    });

    it('dismiss된 행이 없으면 아무 일도 하지 않는다 (no-op)', async () => {
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(undismissMock).not.toHaveBeenCalled();
        expect(cacheDeleteMock).not.toHaveBeenCalled();
    });
});
