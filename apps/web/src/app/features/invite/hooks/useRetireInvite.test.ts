import { renderHook } from '@testing-library/react';

const cancelInviteMock = jest.fn();
const markCanceledMock = jest.fn();
const refetchMock = jest.fn();
let mockInvites: Array<{ id: string; code?: string; state?: string }> = [];

jest.mock('../../../hooks', () => ({
    useRelayInviteMutations: () => ({ cancelInvite: cancelInviteMock }),
    useRelayInvites: () => ({ invites: mockInvites, isLoading: false, refetch: refetchMock }),
}));
jest.mock('./useLocallyCanceledInvites', () => ({
    useLocallyCanceledInvites: () => ({ markCanceled: markCanceledMock }),
}));

import { useRetireInvite } from './useRetireInvite';

const renderRetire = () => renderHook(() => useRetireInvite()).result.current.retire;

describe('useRetireInvite — retire 규칙 표 1:1', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        cancelInviteMock.mockResolvedValue({ id: 'invt-1', state: 'canceled' });
        refetchMock.mockResolvedValue({ data: [] });
        mockInvites = [];
    });

    it.each(['pending', 'expired'] as const)('%s은 합성 코드로 invite.cancel을 보낸다', async state => {
        mockInvites = [{ id: '910001-3', code: '3f9a8b', state }];
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state } as never);

        expect(cancelInviteMock).toHaveBeenCalledWith('invt:910001-3:3f9a8b');
        expect(outcome).toBe('canceled');
        expect(markCanceledMock).not.toHaveBeenCalled();
        expect(refetchMock).not.toHaveBeenCalled(); // 목록에 코드가 이미 있으므로 재조회가 필요 없다
    });

    it('취소가 409(이미 수락)로 지면 conflict — 호출부가 재발급을 중단하고 목록을 재조회한다', async () => {
        mockInvites = [{ id: '910001-3', code: '3f9a8b', state: 'pending' }];
        cancelInviteMock.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state: 'pending' } as never);

        expect(outcome).toBe('conflict');
    });

    it('취소가 그 외 이유로 지면 failed — pending 재발급은 여기서 멈춘다', async () => {
        mockInvites = [{ id: '910001-3', code: '3f9a8b', state: 'pending' }];
        cancelInviteMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state: 'pending' } as never);

        expect(outcome).toBe('failed');
    });

    it('캐시 전용 행(코드 없음)이면 목록에서 재조회를 한 번 시도한 뒤에도 없으면 failed다', async () => {
        // 목록에 해당 id가 있지만 코드가 없다(캐시 히트 — ADR-0052). 재조회도 코드를 못 주면 failed.
        mockInvites = [{ id: '910001-3', state: 'pending' }];
        refetchMock.mockResolvedValue({ data: [{ id: '910001-3', state: 'pending' }] });
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', state: 'pending' } as never);

        expect(refetchMock).toHaveBeenCalledTimes(1);
        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(outcome).toBe('failed');
    });

    it('캐시 전용 행이어도 재조회 응답에 코드가 있으면 취소를 진행한다', async () => {
        mockInvites = [{ id: '910001-3', state: 'pending' }];
        refetchMock.mockResolvedValue({ data: [{ id: '910001-3', code: 'fresh-secret', state: 'pending' }] });
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', state: 'pending' } as never);

        expect(cancelInviteMock).toHaveBeenCalledWith('invt:910001-3:fresh-secret');
        expect(outcome).toBe('canceled');
    });

    it('rejected는 서버 호출 없이 로컬 dismiss다 — 서버는 거절 표식을 덮지 않는다', async () => {
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state: 'rejected' } as never);

        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(markCanceledMock).toHaveBeenCalledWith('910001-3');
        expect(outcome).toBe('dismissed');
    });

    it.each(['canceled', 'accepted', undefined] as const)('%s은 아무것도 하지 않는다(skipped)', async state => {
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state } as never);

        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(markCanceledMock).not.toHaveBeenCalled();
        expect(outcome).toBe('skipped');
    });
});
