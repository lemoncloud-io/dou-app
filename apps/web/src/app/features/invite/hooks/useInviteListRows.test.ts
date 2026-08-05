import { renderHook } from '@testing-library/react';

let mockInvites: Array<{ id: string; state?: string }> = [];
const isCanceledMock = jest.fn();

jest.mock('../../../hooks', () => ({
    useRelayInvites: () => ({ invites: mockInvites, isLoading: false, refetch: jest.fn() }),
}));
jest.mock('./useLocallyCanceledInvites', () => ({
    useLocallyCanceledInvites: () => ({ isCanceled: (id: string) => isCanceledMock(id) }),
}));

import { useInviteListRows } from './useInviteListRows';

describe('useInviteListRows', () => {
    beforeEach(() => {
        isCanceledMock.mockReturnValue(false);
        mockInvites = [
            { id: 'pending-1', state: 'pending' },
            { id: 'expired-1', state: 'expired' },
            { id: 'rejected-1', state: 'rejected' },
            { id: 'accepted-1', state: 'accepted' },
            { id: 'canceled-1', state: 'canceled' },
        ];
    });

    it('pending·expired·rejected만 남긴다 — accepted는 실채널 행이, canceled는 발신자가 이미 정리했다', () => {
        const { result } = renderHook(() => useInviteListRows());
        expect(result.current.invites.map(i => i.id)).toEqual(['pending-1', 'expired-1', 'rejected-1']);
    });

    it('로컬 dismiss된 invite는 제외한다 — 재초대로 처리한 rejected 행이 대표 사례다', () => {
        isCanceledMock.mockImplementation((id: string) => id === 'rejected-1');

        const { result } = renderHook(() => useInviteListRows());

        expect(result.current.invites.map(i => i.id)).toEqual(['pending-1', 'expired-1']);
    });

    it('id가 없는 항목은 제외한다', () => {
        mockInvites = [{ id: '', state: 'pending' } as never];
        const { result } = renderHook(() => useInviteListRows());
        expect(result.current.invites).toEqual([]);
    });
});
