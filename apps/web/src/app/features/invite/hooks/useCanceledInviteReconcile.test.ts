import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

const cancelInviteMock = jest.fn();
const undismissMock = jest.fn();
const cacheDeleteMock = jest.fn();

type InviteRow = { id?: string; code?: string; state?: string; dismissedAt?: number };

/**
 * What the hook RENDERS from: the cache-merged rows. Codes are absent on purpose — the cache
 * strips them (ADR-0052) and home no longer fetches the list, so this is the only shape the drain
 * ever sees up front.
 */
let mockInvites: InviteRow[] = [];
/** What the one up-front `refetch()` answers with — the only place a `code` can come from. */
let mockRemote: InviteRow[] | undefined;
let mockIsLoading = false;
const refetchMock = jest.fn(async () => ({ data: mockRemote }));

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('../../../hooks', () => ({
    useRelayInvites: () => ({ invites: mockInvites, isLoading: mockIsLoading, refetch: refetchMock }),
    useRelayInviteMutations: () => ({ cancelInvite: cancelInviteMock }),
}));

import { useCanceledInviteReconcile } from './useCanceledInviteReconcile';

describe('useCanceledInviteReconcile — S9 분기 전부', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsLoading = false;
        mockInvites = [];
        mockRemote = [{ id: 'invt-1', code: 'c0de', state: 'pending' }];
        cancelInviteMock.mockResolvedValue({ state: 'canceled' });
        (useRuntimeRepositories as jest.Mock).mockReturnValue({
            invite: { undismiss: undismissMock, cacheDelete: cacheDeleteMock },
        });
    });

    it('dismiss된 행이 있고 서버가 아직 pending이면 실제 cancel을 발사하고 dismiss를 해제한다', async () => {
        mockInvites = [{ id: 'invt-1', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledWith('invt:invt-1:c0de'));
        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('expired 행도 cancel 대상이다 — 서버 목록 정리', async () => {
        mockInvites = [{ id: 'invt-1', state: 'expired', dismissedAt: 1 }];
        mockRemote = [{ id: 'invt-1', code: 'c0de', state: 'expired' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalled());
        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('rejected 행의 dismiss는 유지한다 — 정상 상태의 dismiss 마커이지 레거시 기록이 아니다', async () => {
        mockInvites = [{ id: 'invt-1', state: 'rejected', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        // The pass runs asynchronously; give it a tick before asserting nothing happened.
        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(undismissMock).not.toHaveBeenCalled();
        expect(cacheDeleteMock).not.toHaveBeenCalled();
    });

    it.each(['canceled', 'accepted'] as const)('%s 행은 서버가 이미 아는 상태다 — dismiss만 해제한다', async state => {
        mockInvites = [{ id: 'invt-1', state, dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
    });

    it('state가 없는 행(마이그레이션 스텁, 서버 응답과 매칭된 적 없음)은 스텁을 통째로 지운다', async () => {
        mockInvites = [
            { id: 'invt-gone', dismissedAt: 1 }, // no state — never matched a server row
            { id: 'invt-1', state: 'pending' }, // unrelated, not dismissed
        ];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cacheDeleteMock).toHaveBeenCalledWith('invt-gone'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(undismissMock).not.toHaveBeenCalled();
    });

    it('cancel이 409(이미 수락)로 져도 dismiss는 해제한다 — 더 거둘 것이 없다', async () => {
        cancelInviteMock.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));
        mockInvites = [{ id: 'invt-1', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
    });

    it('cancel이 그 외 이유로 지면 dismiss를 남겨 다음 기회에 재시도한다 — 멱등이라 안전', async () => {
        cancelInviteMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        mockInvites = [{ id: 'invt-1', state: 'pending', dismissedAt: 1 }];

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
        mockInvites = [{ id: 'invt-1', state: 'pending', dismissedAt: 1 }];
        mockRemote = [
            { id: 'invt-1', code: 'c0de', state: 'pending' },
            { id: 'invt-2', code: 'c0de2', state: 'pending' },
        ];
        rerender();

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));

        // A later list refresh must not replay the pass in the same mount.
        mockInvites = [
            { id: 'invt-1', state: 'pending', dismissedAt: 1 },
            { id: 'invt-2', state: 'pending', dismissedAt: 1 },
        ];
        rerender();
        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(1));
    });

    // 캐시엔 code가 없으므로(자격증명 — ADR-0052) 드레인은 서버에 딱 한 번 되묻고 그 응답에서 모든
    // code를 뽑는다. 홈이 목록을 미리 조회하지 않게 된 뒤로 이 재조회가 유일한 code 출처다.
    it('code가 필요한 행이 있을 때만 서버에 한 번 되묻는다 — 행이 여러 개여도 한 번', async () => {
        mockInvites = [
            { id: 'invt-1', state: 'pending', dismissedAt: 1 },
            { id: 'invt-2', state: 'pending', dismissedAt: 1 },
        ];
        mockRemote = [
            { id: 'invt-1', code: 'c0de', state: 'pending' },
            { id: 'invt-2', code: 'c0de2', state: 'pending' },
        ];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).toHaveBeenCalledTimes(2));
        expect(refetchMock).toHaveBeenCalledTimes(1);
        expect(cancelInviteMock).toHaveBeenCalledWith('invt:invt-1:c0de');
        expect(cancelInviteMock).toHaveBeenCalledWith('invt:invt-2:c0de2');
    });

    it.each(['canceled', 'accepted'] as const)('%s 행은 code가 필요없다 — 라운드트립 없이 해제한다', async state => {
        mockInvites = [{ id: 'invt-1', state, dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-1'));
        expect(refetchMock).not.toHaveBeenCalled();
    });

    // 회귀 지점: 응답을 못 받았는데 dismiss를 해제하면 레거시 취소가 서버에 닿지 않은 채 조용히
    // 사라진다. relay가 refetch의 대기창 안에 인증되지 않으면 아무것도 건드리지 않고 물러난다.
    it('재조회가 응답을 못 주면 아무 기록도 건드리지 않는다 — 다음 마운트에 재시도', async () => {
        mockInvites = [{ id: 'invt-1', state: 'pending', dismissedAt: 1 }];
        mockRemote = undefined;

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(refetchMock).toHaveBeenCalled());
        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(undismissMock).not.toHaveBeenCalled();
        expect(cacheDeleteMock).not.toHaveBeenCalled();
    });

    it('서버 응답에 없는 행(목록 창 밖)은 취소할 code가 없다 — dismiss만 해제한다', async () => {
        mockInvites = [{ id: 'invt-gone', state: 'pending', dismissedAt: 1 }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(undismissMock).toHaveBeenCalledWith('invt-gone'));
        expect(cancelInviteMock).not.toHaveBeenCalled();
    });

    it('dismiss된 행이 없으면 아무 일도 하지 않는다 (no-op)', async () => {
        mockInvites = [{ id: 'invt-1', state: 'pending' }];

        renderHook(() => useCanceledInviteReconcile());

        await waitFor(() => expect(cancelInviteMock).not.toHaveBeenCalled());
        expect(undismissMock).not.toHaveBeenCalled();
        expect(cacheDeleteMock).not.toHaveBeenCalled();
    });
});
