import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat, DomainUser } from '@chatic/data';

import { useChats } from './useChats';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        sync: {
            useChatSync: jest.fn(),
        },
        session: {
            useSessionIdentity: jest.fn(),
        },
        connection: {
            useRuntimeSocketState: jest.fn(),
        },
    },
}));

// Covered by its own test file; isolate useChats from the foreground-refresh side effects.
jest.mock('./useForegroundChatRefresh', () => ({ useForegroundChatRefresh: jest.fn() }));

const chatObserveList = jest.fn();
const chatRefreshList = jest.fn();
const userObserveList = jest.fn();

const chat = (fields: Partial<DomainChat>): DomainChat => fields as unknown as DomainChat;

const seedChats = (chats: DomainChat[]) =>
    chatObserveList.mockImplementation((_query, cb) => {
        cb({ list: chats });
        return () => undefined;
    });

const seedUsers = (users: Array<Partial<DomainUser>>) =>
    userObserveList.mockImplementation((_query, cb) => {
        cb({ list: users });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    seedUsers([{ id: 'u1', name: 'Alice' }]);
    // Always resolve so the entry refreshList's `.catch` chain is safe by default.
    chatRefreshList.mockResolvedValue({ fetchedCount: 0 });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeList: chatObserveList, refreshList: chatRefreshList },
        user: { observeList: userObserveList },
    });
    (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
});

describe('useChats — 메시지 매핑/정렬/페이징', () => {
    it('오래된→최신 순으로 정렬하고 소유/시스템/이름/시각을 매핑한다', () => {
        seedChats([
            chat({ id: 'b', chatNo: 2, ownerId: 'me', stereo: 'user', createdAtMs: 200 }),
            chat({ id: 'a', chatNo: 1, ownerId: 'u1', stereo: 'system', createdAtMs: 100 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        const [first, second] = result.current.messages;
        expect(first.chatNo).toBe(1); // ascending: oldest first
        expect(first.isOwner).toBe(false);
        expect(first.isSystem).toBe(true);
        expect(first.ownerName).toBe('Alice'); // resolved from user cache
        expect(first.timestamp.getTime()).toBe(100);

        expect(second.chatNo).toBe(2);
        expect(second.isOwner).toBe(true); // ownerId === myUid
        expect(second.isSystem).toBe(false);
    });

    it('내가 주체인 시스템 메시지는 목록에서 숨기고, 타인의 시스템 메시지는 유지한다', () => {
        seedChats([
            chat({ id: 'a', chatNo: 1, ownerId: 'u1', stereo: 'system', createdAtMs: 100 }),
            chat({ id: 'b', chatNo: 2, ownerId: 'me', stereo: 'system', createdAtMs: 200 }),
            chat({ id: 'c', chatNo: 3, ownerId: 'me', stereo: 'user', createdAtMs: 300 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        // Only my own system row is hidden — my normal message and others' system rows remain.
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'c']);
    });

    // ADR-0093: reaction events used to render as empty SystemNotice pills and replies
    // leaked into the main feed. Both fold out of `messages` but stay on `rawChats`,
    // which reaction folding / thread derivation read.
    it('리액션 이벤트와 스레드 답글은 messages에서 숨기고 rawChats에는 남긴다', () => {
        seedChats([
            chat({ id: 'a', chatNo: 1, ownerId: 'u1', stereo: 'user', createdAtMs: 100 }),
            chat({ id: 'b', chatNo: 2, ownerId: 'u1', stereo: 'system', subType: 'reaction', createdAtMs: 200 }),
            chat({ id: 'c', chatNo: 3, ownerId: 'u1', stereo: 'user', parentId: '1', createdAtMs: 300 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        expect(result.current.messages.map(m => m.id)).toEqual(['a']);
        expect(result.current.rawChats.map(c => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('pending(서버 chatNo 없음) 메시지는 상단이 아니라 맨 아래(최신)로 정렬한다', () => {
        seedChats([
            chat({ id: 'p', chatNo: 0, ownerId: 'me', stereo: 'user', isPending: true, createdAtMs: 300 }),
            chat({ id: 'a', chatNo: 1, ownerId: 'me', stereo: 'user', createdAtMs: 100 }),
            chat({ id: 'b', chatNo: 2, ownerId: 'me', stereo: 'user', createdAtMs: 200 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        // chatNo 0 (pending) doesn't get pushed to the front — it comes after the committed 1, 2.
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'p']);
    });

    it('메시지가 없고 로딩이 끝나면 isEmpty=true', () => {
        seedChats([]);
        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        expect(result.current.isEmpty).toBe(true);
    });

    it('입장 시 직접 refreshList를 호출하지 않는다 (초기 로드는 sync 계층이 소유)', () => {
        seedChats([]);
        renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        // useChatSync(here mocked) owns the initial prime fetch, so useChats never calls refreshList on entry.
        expect(chatRefreshList).not.toHaveBeenCalled();
    });

    it('loadMore: 가장 오래된 chatNo를 cursor로 넘기고, fetchedCount 0이면 hasMore=false', async () => {
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1', createdAtMs: 100 })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 0, cursorNo: 5 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        await act(async () => {
            await result.current.loadMore();
        });

        expect(chatRefreshList).toHaveBeenCalledWith({ channelId: 'c1', cursorNo: 5, limit: 50 });
        await waitFor(() => expect(result.current.hasMore).toBe(false));
    });

    it('캐시가 요청한 페이지를 못 채우면 loadMore 없이도 스레드 시작으로 본다', () => {
        // A room this short never overflows the viewport, so the scroll listener never fires
        // loadMore and hasMore stays true — the intro must not wait on that.
        seedChats([chat({ id: 'a', chatNo: 1, ownerId: 'u1', createdAtMs: 100 })]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        expect(result.current.hasMore).toBe(true); // pagination itself stays enabled
        expect(result.current.isThreadStartLoaded).toBe(true);
    });

    it('페이지가 가득 찼으면 아직 스레드 시작이 아니다', () => {
        seedChats(Array.from({ length: 3 }, (_, i) => chat({ id: `c${i}`, chatNo: i + 1, ownerId: 'u1' })));

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 3 }));

        expect(result.current.isThreadStartLoaded).toBe(false);
    });

    it('loadMore가 빈 결과를 주면 스레드 시작으로 확정된다', async () => {
        seedChats(Array.from({ length: 3 }, (_, i) => chat({ id: `c${i}`, chatNo: i + 1, ownerId: 'u1' })));
        chatRefreshList.mockResolvedValue({ fetchedCount: 0, cursorNo: 1 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 3 }));
        await act(async () => {
            await result.current.loadMore();
        });

        await waitFor(() => expect(result.current.isThreadStartLoaded).toBe(true));
    });

    it('loadMore: 순서가 섞여 있어도 가장 작은 chatNo를 cursor로 넘긴다', async () => {
        seedChats([
            chat({ id: 'a', chatNo: 5, ownerId: 'u1', createdAtMs: 500 }),
            chat({ id: 'b', chatNo: 3, ownerId: 'u1', createdAtMs: 300 }),
            chat({ id: 'c', chatNo: 8, ownerId: 'u1', createdAtMs: 800 }),
        ]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 2, cursorNo: 3 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        await act(async () => {
            await result.current.loadMore();
        });

        // The oldest (smallest) chatNo is the page boundary, regardless of array order.
        expect(chatRefreshList).toHaveBeenCalledWith({ channelId: 'c1', cursorNo: 3, limit: 50 });
    });
});

describe('useChats — older pages', () => {
    const lastObserveLimit = () => chatObserveList.mock.calls[chatObserveList.mock.calls.length - 1][0].limit;

    const deferred = <T>() => {
        let resolve!: (value: T) => void;
        let reject!: (reason: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };

    /**
     * An observer whose first subscription answers at once and every later one waits to be
     * answered by hand — for the cases that turn on WHEN a widened window is read back.
     */
    const holdLaterReads = (initial: DomainChat[]) => {
        const reads: Array<{ limit: number; emit: (list: DomainChat[]) => void }> = [];
        chatObserveList.mockImplementation((query, cb) => {
            reads.push({ limit: query.limit, emit: list => cb({ list }) });
            if (reads.length === 1) cb({ list: initial });
            return () => undefined;
        });
        return reads;
    };

    afterEach(() => {
        jest.useRealTimers();
    });

    it('stays loading until the widened window has been read back', async () => {
        const reads = holdLaterReads([chat({ id: 'a', chatNo: 100, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 50, cursorNo: 50, latestNo: 99 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        // The request is back, but its rows are not on screen yet: released now, the next check
        // would read the same oldest row and ask for the same page again.
        expect(lastObserveLimit()).toBe(150);
        expect(result.current.isLoadingMore).toBe(true);

        act(() => reads[reads.length - 1].emit([chat({ id: 'z', chatNo: 50, ownerId: 'u1' })]));
        expect(result.current.isLoadingMore).toBe(false);
    });

    it('sends one request when two callers ask in the same frame', async () => {
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1' })]);
        const page = deferred<{ fetchedCount: number }>();
        chatRefreshList.mockReturnValue(page.promise);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        act(() => {
            void result.current.loadMore();
            void result.current.loadMore();
        });

        expect(chatRefreshList).toHaveBeenCalledTimes(1);
        await act(async () => page.resolve({ fetchedCount: 0 }));
    });

    it('keeps the room up when a page fails, and asks again once the wait is over', async () => {
        jest.useFakeTimers();
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1' })]);
        chatRefreshList.mockRejectedValueOnce(new Error('socket closed')).mockResolvedValue({ fetchedCount: 0 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        // Nothing for the room to fall over on: paging is simply not done yet.
        expect(result.current).not.toHaveProperty('isError');
        expect(result.current.isLoadingMore).toBe(false);
        expect(result.current.hasMore).toBe(true);

        // Inside the wait, a retry is not sent — the prefetch re-checks on every scroll event.
        await act(async () => {
            await result.current.loadMore();
        });
        expect(chatRefreshList).toHaveBeenCalledTimes(1);

        // The wait ending hands callers a new loadMore, which is what re-runs their effects.
        const beforeWait = result.current.loadMore;
        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current.loadMore).not.toBe(beforeWait);

        await act(async () => {
            await result.current.loadMore();
        });
        expect(chatRefreshList).toHaveBeenCalledTimes(2);
    });

    it('waits for the socket to verify before asking for a page', async () => {
        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1' })]);

        const { result, rerender } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });
        expect(chatRefreshList).not.toHaveBeenCalled();

        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
        rerender();
        await act(async () => {
            await result.current.loadMore();
        });
        expect(chatRefreshList).toHaveBeenCalledWith({ channelId: 'c1', cursorNo: 5, limit: 50 });
    });

    it('widens the window by the rows that came back, from the window as it stands', async () => {
        seedChats([chat({ id: 'newest', chatNo: 1000, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 30, cursorNo: 970, latestNo: 999 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        // A jump has made the window 520 wide; adding to the 100-wide page axis would not move it.
        act(() => {
            result.current.loadUntil(500);
        });
        await waitFor(() => expect(lastObserveLimit()).toBe(520));

        await act(async () => {
            await result.current.loadMore();
        });

        expect(lastObserveLimit()).toBe(550);
    });

    it('stops asking once the server reports the last page', async () => {
        seedChats([chat({ id: 'a', chatNo: 11, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 10, cursorNo: 0, latestNo: 10 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        // The last page is still shown; it just is not followed by an empty request to prove it.
        expect(lastObserveLimit()).toBe(110);
        expect(result.current.hasMore).toBe(false);
    });

    it('stops when a page brings nothing new into view', async () => {
        // The cache answers the same rows whatever the window size, as it does when every row the
        // page brought predates my membership.
        seedChats([chat({ id: 'a', chatNo: 60, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 10, cursorNo: 50, latestNo: 59 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });
        await act(async () => {
            await result.current.loadMore();
        });

        expect(chatRefreshList).toHaveBeenCalledTimes(1);
        expect(result.current.hasMore).toBe(false);
    });

    it('does not ask for anything older once the first row I can see is in the window', async () => {
        seedChats([1, 2, 3].map(no => chat({ id: `r${no}`, chatNo: no, ownerId: 'u1' })));
        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        // A re-joiner's history starts right after their join cursor, not at row 1.
        seedChats([8, 9, 10].map(no => chat({ id: `r${no}`, chatNo: no, ownerId: 'u1' })));
        const rejoined = renderHook(() => useChats({ channelId: 'c2', limit: 100, joinedNo: 7 }));
        await act(async () => {
            await rejoined.result.current.loadMore();
        });

        // A short room asks to be filled on every entry; proving it has no more must cost nothing.
        expect(chatRefreshList).not.toHaveBeenCalled();
        expect(result.current.hasMore).toBe(false);
        expect(rejoined.result.current.hasMore).toBe(false);
    });

    it('does not take an unsent message as the cursor', async () => {
        seedChats([
            chat({ id: 'pending', chatNo: 0, ownerId: 'me', isPending: true, createdAtMs: 900 }),
            chat({ id: 'a', chatNo: 7, ownerId: 'u1', createdAtMs: 100 }),
        ]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 0 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        expect(chatRefreshList).toHaveBeenCalledWith({ channelId: 'c1', cursorNo: 7, limit: 50 });
    });

    it('keeps the oldest row in view when new rows arrive after paging back', async () => {
        const rows = (from: number, to: number) =>
            Array.from({ length: to - from + 1 }, (_, i) =>
                chat({ id: `r${from + i}`, chatNo: from + i, ownerId: 'u1' })
            );
        const reads = holdLaterReads(rows(8, 10));
        chatRefreshList.mockResolvedValue({ fetchedCount: 3, cursorNo: 5, latestNo: 7 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 3 }));
        await act(async () => {
            await result.current.loadMore();
        });
        act(() => reads[reads.length - 1].emit(rows(5, 10)));
        expect(lastObserveLimit()).toBe(6);

        // Two messages arrive. The six-row window now holds 7–12: rows 5 and 6, the top of what the
        // reader paged back to, fell out — so the window grows by two to take them back.
        act(() => reads[reads.length - 1].emit(rows(7, 12)));

        expect(lastObserveLimit()).toBe(8);
    });

    it('lets the newest rows push the oldest out before any paging', () => {
        const reads = holdLaterReads([chat({ id: 'a', chatNo: 8, ownerId: 'u1' })]);

        renderHook(() => useChats({ channelId: 'c1', limit: 3 }));
        act(() => reads[0].emit([9, 10, 11].map(no => chat({ id: `r${no}`, chatNo: no, ownerId: 'u1' }))));

        // Nobody has paged back, so nobody is reading the rows that fall out: the window stays
        // bounded instead of growing with every message for as long as the room is open.
        expect(lastObserveLimit()).toBe(3);
    });

    const rowRange = (from: number, to: number) =>
        Array.from({ length: to - from + 1 }, (_, i) => chat({ id: `r${from + i}`, chatNo: from + i, ownerId: 'u1' }));

    it('ends paging on the last page only once its rows are on screen', async () => {
        const reads = holdLaterReads([chat({ id: 'a', chatNo: 11, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 10, cursorNo: 0, latestNo: 10 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });

        // Ended when the request returned, a jump into this very page gave up a render before its
        // rows arrived.
        expect(result.current.hasMore).toBe(true);

        act(() => reads[reads.length - 1].emit(rowRange(1, 11)));
        expect(result.current.hasMore).toBe(false);
        expect(result.current.isLoadingMore).toBe(false);
    });

    it('asks again for a page whose window never came back, instead of ending paging', async () => {
        jest.useFakeTimers();
        holdLaterReads([chat({ id: 'a', chatNo: 60, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 10, cursorNo: 50, latestNo: 59 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });
        act(() => {
            jest.advanceTimersByTime(5000);
        });
        expect(result.current.isLoadingMore).toBe(false);

        // The page never showed, so it is neither progress nor proof that nothing is older.
        await act(async () => {
            await result.current.loadMore();
        });
        expect(chatRefreshList).toHaveBeenCalledTimes(2);
        expect(result.current.hasMore).toBe(true);
    });

    it("sends a person's request at once, past a failed page's wait", async () => {
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1' })]);
        chatRefreshList.mockRejectedValueOnce(new Error('socket closed')).mockResolvedValue({ fetchedCount: 0 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        await act(async () => {
            await result.current.loadMore();
        });
        await act(async () => {
            await result.current.loadMore({ immediate: true });
        });

        expect(chatRefreshList).toHaveBeenCalledTimes(2);
    });

    it('grows the jump axis after a jump, leaving the thread-start verdict alone', async () => {
        seedChats([chat({ id: 'newest', chatNo: 1000, ownerId: 'u1' })]);
        chatRefreshList.mockResolvedValue({ fetchedCount: 30, cursorNo: 970, latestNo: 999 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 1 }));
        expect(result.current.isThreadStartLoaded).toBe(false);
        act(() => {
            result.current.loadUntil(500);
        });
        await waitFor(() => expect(lastObserveLimit()).toBe(520));

        await act(async () => {
            await result.current.loadMore();
        });

        expect(lastObserveLimit()).toBe(550);
        // Copied into pageLimit, the jump's over-estimate would read as rows the cache could not fill.
        expect(result.current.isThreadStartLoaded).toBe(false);
    });

    it('keeps the window bounded while the reader is at the bottom', async () => {
        const readingHistoryRef = { current: false };
        const reads = holdLaterReads(rowRange(8, 10));
        chatRefreshList.mockResolvedValue({ fetchedCount: 3, cursorNo: 5, latestNo: 7 });

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 3, readingHistoryRef }));
        await act(async () => {
            await result.current.loadMore();
        });
        act(() => reads[reads.length - 1].emit(rowRange(5, 10)));
        expect(lastObserveLimit()).toBe(6);

        // Back at the bottom, nobody is reading rows 5 and 6: arrivals push them out as they always
        // did, instead of growing the window for as long as the room stays open.
        act(() => reads[reads.length - 1].emit(rowRange(7, 12)));

        expect(lastObserveLimit()).toBe(6);
    });

    it('says whether a page can be sent right now', () => {
        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });
        seedChats([]);

        const { result, rerender } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        expect(result.current.canLoadMore).toBe(false);

        (runtime.connection.useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
        rerender();
        expect(result.current.canLoadMore).toBe(true);
    });

    it('drops a page that comes back after the channel changed', async () => {
        seedChats([chat({ id: 'a', chatNo: 5, ownerId: 'u1' })]);
        const page = deferred<{ fetchedCount: number; cursorNo: number }>();
        chatRefreshList.mockReturnValue(page.promise);

        const { result, rerender } = renderHook(({ channelId }) => useChats({ channelId, limit: 100 }), {
            initialProps: { channelId: 'c1' },
        });
        act(() => {
            void result.current.loadMore();
        });
        rerender({ channelId: 'c2' });
        await act(async () => page.resolve({ fetchedCount: 50, cursorNo: 1 }));

        expect(lastObserveLimit()).toBe(100);
        expect(result.current.isLoadingMore).toBe(false);
    });
});

describe('useChats — loadUntil (점프용 캐시 윈도우 확장)', () => {
    const lastObserveLimit = () => chatObserveList.mock.calls[chatObserveList.mock.calls.length - 1][0].limit;

    it('캐시된 과거 메시지를 창 안으로 들이고, 서버를 부르지 않는다', async () => {
        // Jumping to a chatNo far past the window (100). Server paging fetches 50 rows at a
        // time, so this distance couldn't be reached within the budget (8 pages).
        seedChats([chat({ id: 'newest', chatNo: 1000, ownerId: 'u1', createdAtMs: 1000 })]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        let grew = false;
        act(() => {
            grew = result.current.loadUntil(500);
        });

        expect(grew).toBe(true);
        await waitFor(() => expect(lastObserveLimit()).toBe(1000 - 500 + 20));
        expect(chatRefreshList).not.toHaveBeenCalled();
    });

    it('창이 이미 그만큼 넓으면 확장하지 않는다 — 호출자는 서버 페이징으로 넘어간다', () => {
        seedChats([chat({ id: 'newest', chatNo: 120, ownerId: 'u1', createdAtMs: 1000 })]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        const before = lastObserveLimit();

        let grew = true;
        act(() => {
            grew = result.current.loadUntil(110);
        });

        expect(grew).toBe(false);
        expect(lastObserveLimit()).toBe(before);
    });

    it('이미 보이는 메시지나 잘못된 번호에는 반응하지 않는다', () => {
        seedChats([chat({ id: 'newest', chatNo: 1000, ownerId: 'u1', createdAtMs: 1000 })]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        act(() => {
            expect(result.current.loadUntil(1000)).toBe(false);
            expect(result.current.loadUntil(0)).toBe(false);
        });
    });

    it('확장된 창이 "대화 시작 도달" 판정을 흔들지 않는다', async () => {
        // With only 1 row in the cache, widening the window a lot would make
        // chats.length < pageLimit true — the jump-driven expansion has to be a separate axis
        // from pageLimit.
        seedChats([chat({ id: 'newest', chatNo: 1000, ownerId: 'u1', createdAtMs: 1000 })]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 1 }));
        const before = result.current.isThreadStartLoaded;

        act(() => {
            result.current.loadUntil(500);
        });

        await waitFor(() => expect(lastObserveLimit()).toBeGreaterThan(1));
        expect(result.current.isThreadStartLoaded).toBe(before);
    });
});

describe('useChats — 재입장 이력 숨기기 (ADR-0067)', () => {
    it('joinedNo 이하의 캐시 행은 피드에서 빠진다', () => {
        seedChats([
            chat({ id: 'old', chatNo: 3, ownerId: 'u1', createdAtMs: 300 }),
            chat({ id: 'new', chatNo: 8, ownerId: 'u1', createdAtMs: 800 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100, joinedNo: 7 }));

        expect(result.current.messages.map(message => message.id)).toEqual(['new']);
    });

    it('전송 중인 낙관적 행(chatNo 0)은 joinedNo와 무관하게 남는다', () => {
        // The optimistic row has no server number yet; hiding it would erase the message the user
        // just typed — the whole reason the helper exempts a falsy chatNo.
        seedChats([
            chat({ id: 'old', chatNo: 3, ownerId: 'u1', createdAtMs: 300 }),
            chat({ id: 'pending', chatNo: 0, ownerId: 'me', createdAtMs: 900, isPending: true }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100, joinedNo: 7 }));

        expect(result.current.messages.map(message => message.id)).toEqual(['pending']);
    });

    it('rawChats에서도 빠진다 — 재입장 유저에게 "대화의 시작"이 잘못 뜨지 않는다', () => {
        // ChannelRoomPage turns on RoomIntro via `rawChats.some(chat => chat.chatNo === 1)`. If
        // the pre-departure row #1 left over in the cache showed up here, the "start of
        // conversation" block would appear only for someone who rejoined partway through — not
        // for the person who was originally invited. Reaction folding and thread construction
        // read the same list too.
        seedChats([
            chat({ id: 'first', chatNo: 1, ownerId: 'u1', createdAtMs: 100 }),
            chat({ id: 'new', chatNo: 8, ownerId: 'u1', createdAtMs: 800 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100, joinedNo: 7 }));

        expect(result.current.rawChats.map(row => row.id)).toEqual(['new']);
    });

    it('joinedNo가 없으면 (아직 join 행이 안 왔거나 서버가 안 준 경우) 아무것도 숨기지 않는다', () => {
        seedChats([
            chat({ id: 'old', chatNo: 3, ownerId: 'u1', createdAtMs: 300 }),
            chat({ id: 'new', chatNo: 8, ownerId: 'u1', createdAtMs: 800 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        expect(result.current.messages.map(message => message.id)).toEqual(['old', 'new']);
    });
});
