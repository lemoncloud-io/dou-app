import { renderHook } from '@testing-library/react';

const refetchMock = jest.fn();
let mockInvites: Array<{ id: string; state?: string }> = [];

jest.mock('../../../hooks', () => ({
    useRelayInvites: () => ({ invites: mockInvites, isLoading: false, refetch: refetchMock }),
}));

import { useInviteWaitingStatus } from './useInviteWaitingStatus';

describe('useInviteWaitingStatus', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockInvites = [
            { id: 'invite-1', state: 'pending' },
            { id: 'invite-2', state: 'expired' },
        ];
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('id가 일치하는 invite를 목록에서 찾아 반환한다', () => {
        const { result } = renderHook(() => useInviteWaitingStatus('invite-1'));
        expect(result.current.invite).toEqual({ id: 'invite-1', state: 'pending' });
    });

    it('일치하는 invite가 없으면 undefined다', () => {
        const { result } = renderHook(() => useInviteWaitingStatus('invite-missing'));
        expect(result.current.invite).toBeUndefined();
    });

    it('30초마다 refetch를 호출한다', () => {
        renderHook(() => useInviteWaitingStatus('invite-1'));
        expect(refetchMock).not.toHaveBeenCalled();

        jest.advanceTimersByTime(30_000);
        expect(refetchMock).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(60_000);
        expect(refetchMock).toHaveBeenCalledTimes(3);
    });

    it('언마운트 후에는 더 이상 refetch를 호출하지 않는다', () => {
        const { unmount } = renderHook(() => useInviteWaitingStatus('invite-1'));
        unmount();

        jest.advanceTimersByTime(120_000);
        expect(refetchMock).not.toHaveBeenCalled();
    });
});
