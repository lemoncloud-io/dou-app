import { renderHook, waitFor } from '@testing-library/react';

const cancelInviteMock = jest.fn();
const clearCanceledMock = jest.fn();

let mockInvites: Array<{ id?: string; code?: string; state?: string }> = [];
let mockIsLoading = false;
let mockCanceledIds: string[] = [];

jest.mock('../../../hooks', () => ({
    useRelayInvites: () => ({ invites: mockInvites, isLoading: mockIsLoading, refetch: jest.fn() }),
    useRelayInviteMutations: () => ({ cancelInvite: cancelInviteMock }),
}));
jest.mock('./useLocallyCanceledInvites', () => ({
    useLocallyCanceledInvites: () => ({ canceledIds: mockCanceledIds, clearCanceled: clearCanceledMock }),
}));

import { useCanceledInviteReconcile } from './useCanceledInviteReconcile';

describe('useCanceledInviteReconcile — S9 분기 전부', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsLoading = false;
        mockInvites = [];
        mockCanceledIds = [];
        cancelInviteMock.mockResolvedValue({ state: 'canceled' });
    });

    it('기록이 있고 서버가 아직 pending이면 실제 cancel을 발사하고 기록을 지운다', async () => {
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledWith('invt:invt-1:c0de'));
        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invt-1'));
    });

    it('expired 행도 cancel 대상이다 — 서버 목록 정리', async () => {
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'expired' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalled());
        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invt-1'));
    });

    it('rejected 행의 기록은 유지한다 — dismiss 마커로 역할이 바뀌었다', async () => {
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'rejected' }];

        renderHook(() => useCanceledInviteReconcile());

        // The pass runs asynchronously; give it a tick before asserting nothing happened.
        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(clearCanceledMock).not.toHaveBeenCalled();
    });

    it.each(['canceled', 'accepted'] as const)('%s 행은 서버가 이미 아는 상태다 — 기록만 지운다', async state => {
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invt-1'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
    });

    it('행이 목록 창 밖이면 코드가 없어 못 거둔다 — 기록만 지운다(만료로 자연 소멸)', async () => {
        mockCanceledIds = ['invt-gone'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invt-gone'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
    });

    it('cancel이 409(이미 수락)로 져도 기록은 지운다 — 더 거둘 것이 없다', async () => {
        cancelInviteMock.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(clearCanceledMock).toHaveBeenCalledWith('invt-1'));
    });

    it('cancel이 그 외 이유로 지면 기록을 남겨 다음 기회에 재시도한다 — 멱등이라 안전', async () => {
        cancelInviteMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        mockCanceledIds = ['invt-1'];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalled());
        expect(clearCanceledMock).not.toHaveBeenCalled();
    });

    it('목록 로딩 중에는 돌지 않고, 로딩이 끝난 뒤 한 번만 돈다', async () => {
        mockIsLoading = true;
        mockCanceledIds = ['invt-1'];
        mockInvites = [];

        const { rerender } = renderHook(() => useCanceledInviteReconcile());
        expect(cancelInviteMock).not.toHaveBeenCalled();

        mockIsLoading = false;
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];
        rerender();

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));

        // A later list refresh must not replay the pass in the same mount.
        mockInvites = [
            { id: 'invt-1', code: 'c0de', state: 'pending' },
            { id: 'invt-2', code: 'x', state: 'pending' },
        ];
        rerender();
        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));
    });

    it('기록이 비어 있으면 아무 일도 하지 않는다 (no-op)', async () => {
        mockCanceledIds = [];
        mockInvites = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(clearCanceledMock).not.toHaveBeenCalled();
    });
});
