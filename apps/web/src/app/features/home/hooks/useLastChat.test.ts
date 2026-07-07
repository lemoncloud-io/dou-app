import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat } from '@chatic/data';

import { useLastChat } from './useLastChat';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useChatSync: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

const chatObserveList = jest.fn();

const chat = (chatNo: number, content: string, fields: Partial<DomainChat> = {}): DomainChat =>
    ({ chatNo, content, ...fields }) as unknown as DomainChat;

// Seed the observed chat list (callback fires synchronously, like the real cache observer).
const seedChats = (chats: DomainChat[], dispose: () => void = () => undefined) =>
    chatObserveList.mockImplementation((_query, cb) => {
        cb({ list: chats });
        return dispose;
    });

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ chat: { observeList: chatObserveList } });
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
            chat(3, 'hello', { ownerId: 'u1', stereo: 'text' }),
            chat(4, 'me joined', { ownerId: 'me', stereo: 'system' }),
        ]);
        const { result } = renderHook(() => useLastChat('ch-1'));
        expect(result.current?.chatNo).toBe(3);
    });

    it('타인의 시스템 메시지는 프리뷰로 유지한다', () => {
        seedChats([
            chat(3, 'hello', { ownerId: 'u1', stereo: 'text' }),
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
});
