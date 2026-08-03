import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat, DomainUser } from '@chatic/data';

import { useChats } from './useChats';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useChatSync: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));
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
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeList: chatObserveList, refreshList: chatRefreshList },
        user: { observeList: userObserveList },
    });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
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

    it('pending(서버 chatNo 없음) 메시지는 상단이 아니라 맨 아래(최신)로 정렬한다', () => {
        seedChats([
            chat({ id: 'p', chatNo: 0, ownerId: 'me', stereo: 'user', isPending: true, createdAtMs: 300 }),
            chat({ id: 'a', chatNo: 1, ownerId: 'me', stereo: 'user', createdAtMs: 100 }),
            chat({ id: 'b', chatNo: 2, ownerId: 'me', stereo: 'user', createdAtMs: 200 }),
        ]);

        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));

        // chatNo 0(pending)이 맨 앞으로 밀리지 않고, 커밋된 1,2 뒤에 온다.
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
