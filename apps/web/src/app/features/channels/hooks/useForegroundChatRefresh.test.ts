import { act, renderHook } from '@testing-library/react';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        sync: {
            getSyncManager: jest.fn(),
            fetchRoomFeed: jest.fn(),
        },
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
        session: {
            getGlobalSessionContext: jest.fn(),
        },
    },
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// Capture the foreground handler so tests can fire the signal directly.
jest.mock('../../../bridge', () => ({ useAppForeground: jest.fn() }));

import { runtime } from '@chatic/app-runtime';

import { useAppForeground } from '../../../bridge';
import { useForegroundChatRefresh } from './useForegroundChatRefresh';
import {
    clearActivePerfTrace,
    configurePerfTraces,
    resetPerfTraces,
    setActivePerfTrace,
    startPerfTrace,
} from '@chatic/perf';

const mockUseAppForeground = useAppForeground as jest.Mock;

const cacheReadList = jest.fn();
const fetchRoomFeed = runtime.sync.fetchRoomFeed as jest.Mock;
const updateLocalSnapshot = jest.fn();

const setVerified = (isVerified: boolean) =>
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified });
const setCachedChats = (chatNos: number[]) =>
    cacheReadList.mockResolvedValue({ list: chatNos.map(chatNo => ({ chatNo })) });

const setSelectedCloud = (cid: string) =>
    (runtime.session.getGlobalSessionContext as jest.Mock).mockReturnValue({ cloud: { cloudId: cid } });

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
    fetchRoomFeed.mockResolvedValue({ fetchedCount: 0, latestNo: 0, total: 0 });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { cacheReadList } });
    (runtime.sync.getSyncManager as jest.Mock).mockReturnValue({ updateLocalSnapshot });
    setVerified(true);
    setSelectedCloud('cloud-a');
});

describe('useForegroundChatRefresh — 포그라운드/진입 시 채팅 갭 보정', () => {
    it('warm 캐시면 진입 시 베이스라인 재정렬 후 최신 페이지를 refetch한다', async () => {
        setCachedChats([3, 7, 5]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 7, minNo: 0, messages: [] },
            { cid: 'cloud-a' }
        );
        expect(fetchRoomFeed).toHaveBeenCalledWith('cloud-a', 'ch-1', { cache: 'hit', fresh: false });
    });

    it('cold 캐시(빈 방)면 fetch하지 않는다 — 첫 fetch는 usePrimeChat 소유', async () => {
        setCachedChats([]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).not.toHaveBeenCalled();
        expect(fetchRoomFeed).not.toHaveBeenCalled();
    });

    it('포그라운드 복귀 신호에서 warm 방을 다시 refetch한다', async () => {
        setCachedChats([7]);
        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });
        fetchRoomFeed.mockClear();

        await fireForeground();

        expect(fetchRoomFeed).toHaveBeenCalledWith('cloud-a', 'ch-1', { cache: 'hit', fresh: true });
    });

    it('미인증이면 진입(entry effect)에서는 refetch하지 않는다 — 콜드스타트 보호', async () => {
        setVerified(false);
        setCachedChats([7]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(fetchRoomFeed).not.toHaveBeenCalled();
    });

    it('미인증이어도 포그라운드 복귀에서는 refetch한다 — 요청 계층이 401/재연결을 자가치유', async () => {
        setVerified(false);
        setCachedChats([7]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });
        expect(fetchRoomFeed).not.toHaveBeenCalled(); // entry is gated, so it doesn't run here

        await fireForeground();

        expect(fetchRoomFeed).toHaveBeenCalledWith('cloud-a', 'ch-1', { cache: 'hit', fresh: true });
    });

    it('refetch 실패는 조용히 로깅만 하고 전파하지 않는다', async () => {
        setCachedChats([7]);
        fetchRoomFeed.mockRejectedValue(new Error('boom'));

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        // Reaching here without an unhandled rejection is the assertion.
        expect(fetchRoomFeed).toHaveBeenCalledTimes(1);
    });

    it('sends the baseline to the cloud the cache read was made in', async () => {
        setSelectedCloud('cloud-b');
        setCachedChats([4]);

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).toHaveBeenCalledWith(expect.anything(), expect.anything(), { cid: 'cloud-b' });
    });

    it('does not push a baseline or fetch when the selection left the cloud during the cache read', async () => {
        cacheReadList.mockImplementation(async () => {
            // The switch lands while the read is in flight.
            setSelectedCloud('cloud-b');
            return { list: [{ chatNo: 7 }] };
        });

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(updateLocalSnapshot).not.toHaveBeenCalled();
        expect(fetchRoomFeed).not.toHaveBeenCalled();
    });
});

describe('useForegroundChatRefresh — chat_room_sync phases', () => {
    const backend = { start: jest.fn(), stop: jest.fn() };

    beforeEach(() => configurePerfTraces(backend));

    afterEach(() => {
        clearActivePerfTrace('chat_room_sync');
        resetPerfTraces();
    });

    const beginSync = () => {
        const trace = startPerfTrace('chat_room_sync');
        setActivePerfTrace('chat_room_sync', 'ch-1', trace);
        return trace;
    };

    // The fetch phases and the trace's failure ending are fetchRoomFeed's (app-runtime), tested there.
    it('marks verified when the entry effect runs', async () => {
        setCachedChats([3, 7]);
        const trace = beginSync();

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(trace.hasMetric('verified')).toBe(true);
    });

    it('leaves the trace running when the cache read fails before the fetch', async () => {
        cacheReadList.mockRejectedValue(new Error('bridge timeout'));
        beginSync();

        await act(async () => {
            renderHook(() => useForegroundChatRefresh('ch-1'));
        });

        expect(fetchRoomFeed).not.toHaveBeenCalled();
        expect(backend.stop).not.toHaveBeenCalled();
    });
});
