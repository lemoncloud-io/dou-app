import { renderHook } from '@testing-library/react';

const cancelInviteMock = jest.fn();
const markCanceledMock = jest.fn();

jest.mock('../../../hooks', () => ({
    useRelayInviteMutations: () => ({ cancelInvite: cancelInviteMock }),
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
    });

    it.each(['pending', 'expired'] as const)('%s은 합성 코드로 invite.cancel을 보낸다', async state => {
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state } as never);

        expect(cancelInviteMock).toHaveBeenCalledWith('invt:910001-3:3f9a8b');
        expect(outcome).toBe('canceled');
        expect(markCanceledMock).not.toHaveBeenCalled();
    });

    it('취소가 409(이미 수락)로 지면 conflict — 호출부가 재발급을 중단하고 목록을 재조회한다', async () => {
        cancelInviteMock.mockRejectedValue(Object.assign(new Error('conflict'), { errorCode: 409 }));
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state: 'pending' } as never);

        expect(outcome).toBe('conflict');
    });

    it('취소가 그 외 이유로 지면 failed — pending 재발급은 여기서 멈춘다', async () => {
        cancelInviteMock.mockRejectedValue(new Error('503 SOCKET NOT CONNECTED'));
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', code: '3f9a8b', state: 'pending' } as never);

        expect(outcome).toBe('failed');
    });

    it('행에 code가 없으면 호출 없이 failed다 — 반쪽 코드로 쏘지 않는다', async () => {
        const retire = renderRetire();

        const outcome = await retire({ id: '910001-3', state: 'pending' } as never);

        expect(cancelInviteMock).not.toHaveBeenCalled();
        expect(outcome).toBe('failed');
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
