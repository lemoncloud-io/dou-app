import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat } from '@chatic/data';

import { useLastChat } from './useLastChat';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useRuntimeSocketState: jest.fn(),
    useChatSync: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

const chatObserveList = jest.fn();
const chatRefreshList = jest.fn();
const channelObserveItem = jest.fn();

const chat = (chatNo: number, content: string, fields: Partial<DomainChat> = {}): DomainChat =>
    ({ chatNo, content, ...fields }) as unknown as DomainChat;

// Seed the observed chat list (callback fires synchronously, like the real cache observer).
const seedChats = (chats: DomainChat[], dispose: () => void = () => undefined) =>
    chatObserveList.mockImplementation((_query, cb) => {
        cb({ list: chats });
        return dispose;
    });

// Seed the observed channel head (chatNo). Emits synchronously so the head-driven refetch effect
// sees it during mount (after the chat observe has set the cached tail).
const seedChannelHead = (chatNo?: number) =>
    channelObserveItem.mockImplementation((_id, cb) => {
        if (chatNo !== undefined) cb({ chatNo });
        return () => undefined;
    });

beforeEach(() => {
    jest.clearAllMocks();
    chatRefreshList.mockResolvedValue(undefined);
    seedChannelHead(undefined); // no head emit by default
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        chat: { observeList: chatObserveList, refreshList: chatRefreshList },
        channel: { observeItem: channelObserveItem },
    });
    (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: true });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
});

describe('useLastChat — 홈 행의 마지막 메시지', () => {
    it('lookback window로 chat 캐시를 관측한다', () => {
        seedChats([]);
        renderHook(() => useLastChat('ch-1'));
        expect(chatObserveList).toHaveBeenCalledWith({ channelId: 'ch-1', limit: 10 }, expect.any(Function));
    });

    it('캐시가 비면 undefined를 반환한다', () => {
        seedChats([]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current).toBeUndefined();
    });

    it('여러 건이 오면 정렬 순서와 무관하게 max chatNo 메시지를 반환한다', () => {
        seedChats([chat(5, 'a'), chat(9, 'c'), chat(7, 'b')]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current).toEqual(chat(9, 'c'));
    });

    it('최신이 내 시스템 메시지면 그 이전 메시지를 반환한다', () => {
        seedChats([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'user' }),
            chat(4, 'me joined', { ownerId: 'me', stereo: 'system' }),
        ]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current?.chatNo).toBe(3);
    });

    it('타인의 시스템 메시지는 프리뷰로 유지한다', () => {
        seedChats([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'user' }),
            chat(4, 'u1 joined', { ownerId: 'u1', stereo: 'system' }),
        ]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current?.chatNo).toBe(4);
    });

    it('창 안의 메시지가 전부 내 시스템 메시지면 undefined를 반환한다 (desc 폴백)', () => {
        seedChats([chat(1, 'me joined', { ownerId: 'me', stereo: 'system' })]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current).toBeUndefined();
    });

    it('새 emit이 오면 최신 메시지로 갱신한다', () => {
        // Captured synchronously inside the observe mock, before renderHook invokes it.
        let emit!: (result: { list: DomainChat[] }) => void;
        chatObserveList.mockImplementation((_query, cb) => {
            emit = cb;
            cb({ list: [chat(1, 'x')] });
            return () => undefined;
        });

        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current).toEqual(chat(1, 'x'));

        act(() => emit({ list: [chat(2, 'y')] }));
        expect(result.current).toEqual(chat(2, 'y'));
    });

    it('언마운트 시 관측 구독을 해제한다', () => {
        const dispose = jest.fn();
        seedChats([], dispose);
        const { unmount } = renderHook(() => useLastChat('ch-1'));
        unmount();
        expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('채널 head가 캐시 tail보다 앞서면 최신 페이지를 refetch한다', () => {
        seedChats([chat(3, 'old')]); // cached tail = 3
        seedChannelHead(5); // head 5 > 3 → refetch

        renderHook(() => useLastChat('ch-1'));

        expect(chatRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('채널 head가 캐시 tail 이하면 refetch하지 않는다', () => {
        seedChats([chat(5, 'latest')]); // cached tail = 5
        seedChannelHead(5); // head == tail → no refetch

        renderHook(() => useLastChat('ch-1'));

        expect(chatRefreshList).not.toHaveBeenCalled();
    });

    it('미검증(isVerified=false)이면 head가 앞서도 refetch하지 않는다', () => {
        (useRuntimeSocketState as jest.Mock).mockReturnValue({ isVerified: false });
        seedChats([chat(3, 'old')]);
        seedChannelHead(9);

        renderHook(() => useLastChat('ch-1'));

        expect(chatRefreshList).not.toHaveBeenCalled();
    });
});
