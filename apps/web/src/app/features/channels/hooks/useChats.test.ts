import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat, DomainUser } from '@chatic/data';

import { useChats } from './useChats';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

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
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeList: chatObserveList, refreshList: chatRefreshList },
        user: { observeList: userObserveList },
    });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
});

describe('useChats — 메시지 매핑/정렬/페이징', () => {
    it('오래된→최신 순으로 정렬하고 소유/시스템/이름/시각을 매핑한다', () => {
        seedChats([
            chat({ id: 'b', chatNo: 2, ownerId: 'me', stereo: 'text', createdAtMs: 200 }),
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

    it('메시지가 없고 로딩이 끝나면 isEmpty=true', () => {
        seedChats([]);
        const { result } = renderHook(() => useChats({ channelId: 'c1', limit: 100 }));
        expect(result.current.isEmpty).toBe(true);
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
});
