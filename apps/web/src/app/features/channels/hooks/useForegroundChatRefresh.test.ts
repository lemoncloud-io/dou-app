import { act, renderHook } from '@testing-library/react';

jest.mock('@chatic/app-runtime', () => ({
    getSyncManager: jest.fn(),
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// Capture the foreground handler so tests can fire the signal directly.
jest.mock('../../../bridge', () => ({ useAppForeground: jest.fn() }));

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';

import { useAppForeground } from '../../../bridge';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';

const mockUseAppForeground = useAppForeground as jest.Mock;

const cacheReadList = jest.fn();
const refreshList = jest.fn();
const updateLocalSnapshot = jest.fn();

const setVerified = (isVerified: boolean) => (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
const setCachedChats = (chatNos: number[]) =>
    cacheReadList.mockResolvedValue({ list: chatNos.map(chatNo => ({ chatNo })) });

// The latest registered foreground handler (useAppForeground keeps handlers fresh via ref).
const fireForeground = async () => {
    const handler = mockUseAppForeground.mock.calls.at(-1)?.[0];
    await act(async () => {
        handler?.();
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    cacheReadList.mockResolvedValue({ list: [] });
    refreshList.mockResolvedValue({ fetchedCount: 0 });
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { cacheReadList, refreshList } });
    (getSyncManager as jest.Mock).mockReturnValue({ updateLocalSnapshot });
    setVerified(true);
});

describe('useForegroundChatRefresh — 포그라운드/진입 시 채팅 갭 보정', () => {
    it('warm 캐시면 진입 시 베이스라인 재정렬 후 최신 페이지를 refetch한다', async () => {
        setCachedChats([3, 7, 5]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 7, minNo: 0, messages: [] }
        );
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('cold 캐시(빈 방)면 fetch하지 않는다 — 첫 fetch는 usePrimeChat 소유', async () => {
        setCachedChats([]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).not.toHaveBeenCalled();
        expect(refreshList).not.toHaveBeenCalled();
    });

    it('포그라운드 복귀 신호에서 warm 방을 다시 refetch한다', async () => {
        setCachedChats([7]);
        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });
        refreshList.mockClear();

        await fireForeground();

        expect(refreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('미인증이면 진입(entry effect)에서는 refetch하지 않는다 — 콜드스타트 보호', async () => {
        setVerified(false);
        setCachedChats([7]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(refreshList).not.toHaveBeenCalled();
    });

    it('미인증이어도 포그라운드 복귀에서는 refetch한다 — 요청 계층이 401/재연결을 자가치유', async () => {
        setVerified(false);
        setCachedChats([7]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });
        expect(refreshList).not.toHaveBeenCalled(); // entry는 게이트로 미실행

        await fireForeground();

        expect(refreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('refetch 실패는 조용히 로깅만 하고 전파하지 않는다', async () => {
        setCachedChats([7]);
        refreshList.mockRejectedValue(new Error('boom'));

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        // Reaching here without an unhandled rejection is the assertion.
        expect(refreshList).toHaveBeenCalledTimes(1);
    });
});
