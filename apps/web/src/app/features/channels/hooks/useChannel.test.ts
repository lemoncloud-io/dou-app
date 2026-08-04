import { act, renderHook, waitFor } from '@testing-library/react';

import { useChannelSync, useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import { useChannel } from './useChannel';

jest.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: jest.fn(),
    useChannelSync: jest.fn(),
}));
jest.mock('@chatic/web-core', () => ({
    useSessionIdentity: jest.fn(),
}));

const observeItem = jest.fn();
const unsubscribe = jest.fn();

/** Hands back the observer callback so a test can emit whenever it likes (as sync would). */
let emit: (item: DomainChannel | null) => void = () => undefined;

const channelRow = (fields: Partial<DomainChannel> = {}): DomainChannel =>
    ({ id: 'ch-1', ownerId: 'me', memberIds: ['me', 'you'], ...fields }) as unknown as DomainChannel;

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ channel: { observeItem } });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (useChannelSync as jest.Mock).mockReturnValue(undefined);
    observeItem.mockImplementation((_id, cb) => {
        emit = cb;
        return unsubscribe;
    });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useChannel', () => {
    it('캐시에 있으면 즉시 해소한다', async () => {
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(channelRow()));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.channel?.id).toBe('ch-1');
        expect(result.current.isError).toBe(false);
    });

    it('캐시 miss(첫 null)를 부재로 단정하지 않고 계속 기다린다', async () => {
        // 회귀: observeItem은 첫 응답을 캐시만 보고 주므로, 처음 보는 방은 fetch가 도는 중에도
        // null이 즉시 온다. 이걸 답으로 받으면 호출부가 화면을 떠나고 그 fetch까지 끊긴다.
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(null));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.channel).toBeNull();
        expect(result.current.isError).toBe(false);
    });

    it('miss 뒤에 sync가 행을 채우면 그때 해소한다', async () => {
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(null));
        expect(result.current.isLoading).toBe(true);

        act(() => emit(channelRow()));

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.channel?.id).toBe('ch-1');
        expect(result.current.isError).toBe(false);
    });

    it('한 번 받은 행이 사라지면 즉시 부재로 해소한다 (나가기·캐시 삭제)', async () => {
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(channelRow()));
        await waitFor(() => expect(result.current.channel).not.toBeNull());

        act(() => emit(null));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.channel).toBeNull();
        // 제거는 에러가 아니다 — 호출부가 화면을 떠나야 하는 정상 상황이다.
        expect(result.current.isError).toBe(false);
    });

    it('끝내 행이 오지 않으면 무한 로딩이 아니라 에러로 끊는다', async () => {
        jest.useFakeTimers();
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(null));
        expect(result.current.isLoading).toBe(true);

        act(() => {
            jest.advanceTimersByTime(10_000);
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isError).toBe(true);
        expect(result.current.channel).toBeNull();
    });

    it('제한 시간 안에 행이 오면 에러로 넘어가지 않는다', async () => {
        jest.useFakeTimers();
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(channelRow()));
        act(() => {
            jest.advanceTimersByTime(10_000);
        });

        expect(result.current.isError).toBe(false);
        expect(result.current.channel?.id).toBe('ch-1');
    });

    it('channelId가 없으면 기다리지 않고 바로 해소한다', () => {
        const { result } = renderHook(() => useChannel(null));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.channel).toBeNull();
        expect(result.current.isError).toBe(false);
        expect(observeItem).not.toHaveBeenCalled();
    });

    it('channelId가 바뀌면 이전 방의 해소 상태를 물려주지 않는다', async () => {
        const { result, rerender } = renderHook(({ id }) => useChannel(id), {
            initialProps: { id: 'ch-1' },
        });

        act(() => emit(channelRow({ id: 'ch-1' })));
        await waitFor(() => expect(result.current.channel?.id).toBe('ch-1'));

        rerender({ id: 'ch-2' });

        // 새 방은 아직 아무것도 모른다 — 이전 행이 남아 있으면 남의 방을 보여준다.
        expect(result.current.isLoading).toBe(true);
        expect(result.current.channel).toBeNull();

        // 그리고 새 방의 첫 null도 부재로 단정하지 않는다.
        act(() => emit(null));
        expect(result.current.isLoading).toBe(true);
        expect(result.current.isError).toBe(false);
    });

    it('구독과 타이머를 언마운트에서 정리한다', () => {
        jest.useFakeTimers();
        const { unmount } = renderHook(() => useChannel('ch-1'));

        unmount();

        expect(unsubscribe).toHaveBeenCalled();
        // 언마운트 뒤 타이머가 살아 있으면 사라진 컴포넌트에 setState한다.
        expect(jest.getTimerCount()).toBe(0);
    });

    it('소유자 판정과 멤버 수를 뷰모델로 옮긴다', async () => {
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(channelRow({ ownerId: 'me', memberIds: ['me', 'you', 'them'] })));

        await waitFor(() => expect(result.current.channel).not.toBeNull());
        expect(result.current.channel?.isOwner).toBe(true);
        expect(result.current.channel?.memberCount).toBe(3);
    });
});
