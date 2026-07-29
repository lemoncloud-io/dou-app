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
            { id: 'accepted-1', state: 'accepted' },
        ];
    });

    it('pending과 expired만 남긴다(accepted는 실채널 행으로 대체되어 제외)', () => {
        const { result } = renderHook(() => useInviteListRows());
        expect(result.current.invites.map(i => i.id)).toEqual(['pending-1', 'expired-1']);
    });

    it('로컬에서 취소 처리된 invite는 제외한다', () => {
        isCanceledMock.mockImplementation((id: string) => id === 'pending-1');

        const { result } = renderHook(() => useInviteListRows());

        expect(result.current.invites.map(i => i.id)).toEqual(['expired-1']);
    });

    it('id가 없는 항목은 제외한다', () => {
        mockInvites = [{ id: '', state: 'pending' } as never];
        const { result } = renderHook(() => useInviteListRows());
        expect(result.current.invites).toEqual([]);
    });
});
