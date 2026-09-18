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

    // The raw list that resolveInviteCode(invites, refetch, id) needs — a single invite alone gives
    // no basis to re-fetch and retry when the row is cache-only (no code).
    it('전체 목록과 refetch를 그대로 전달한다 (resolveInviteCode가 쓴다)', () => {
        const { result } = renderHook(() => useInviteWaitingStatus('invite-1'));
        expect(result.current.invites).toBe(mockInvites);
        expect(result.current.refetch).toBe(refetchMock);
    });

    // The 30-second re-fetch is delegated to the query options. Running setInterval + refetch()
    // directly would punch through the enabled gate even while relay is unauthenticated and get a
    // `401 UNAUTHORIZED - not authenticated` (refetch() fires even on a disabled query). Scoping it to
    // the mount lifetime is guaranteed as-is by the hook's own options.
    it('30초 폴링을 쿼리 옵션으로 위임한다 — 게이트를 우회하는 수동 refetch 타이머가 아니라', () => {
        renderHook(() => useInviteWaitingStatus('invite-1'));

        expect(useRelayInvitesMock).toHaveBeenCalledWith(undefined, { pollIntervalMs: 30_000 });

        jest.advanceTimersByTime(120_000);
        expect(refetchMock).not.toHaveBeenCalled();
    });
});
