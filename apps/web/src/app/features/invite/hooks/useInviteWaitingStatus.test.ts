import { renderHook } from '@testing-library/react';

const refetchMock = jest.fn();
const useRelayInvitesMock = jest.fn();
let mockInvites: Array<{ id: string; state?: string }> = [];

jest.mock('../../../hooks', () => ({
    useRelayInvites: (...args: unknown[]) => {
        useRelayInvitesMock(...args);
        return { invites: mockInvites, isLoading: false, refetch: refetchMock };
    },
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

    // 30초 재조회는 쿼리 옵션으로 위임한다. 직접 setInterval + refetch()를 돌리면 relay가
    // 미인증인 동안에도 enabled 게이트를 뚫고 나가 `401 UNAUTHORIZED - not authenticated`를 받는다
    // (refetch()는 disabled 쿼리에서도 발사된다). 마운트 범위 한정은 훅 옵션이 그대로 보장한다.
    it('30초 폴링을 쿼리 옵션으로 위임한다 — 게이트를 우회하는 수동 refetch 타이머가 아니라', () => {
        renderHook(() => useInviteWaitingStatus('invite-1'));

        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { pollIntervalMs: 30_000 });

        jest.advanceTimersByTime(120_000);
        expect(refetchMock).not.toHaveBeenCalled();
    });
});
