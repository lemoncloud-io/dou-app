import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useChannel } from './useChannel';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
        },
        sync: {
            useChannelSync: jest.fn(),
            isChannelRefused: jest.fn(),
            subscribeRefusedChannels: jest.fn(),
        },
        session: {
            useSessionIdentity: jest.fn(),
        },
    },
}));

const observeItem = jest.fn();
const unsubscribe = jest.fn();

/** Hands back the observer callback so a test can emit whenever it likes (as sync would). */
let emit: (item: DomainChannel | null) => void = () => undefined;

const channelRow = (fields: Partial<DomainChannel> = {}): DomainChannel =>
    ({ id: 'ch-1', ownerId: 'me', memberIds: ['me', 'you'], ...fields }) as unknown as DomainChannel;

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ channel: { observeItem } });
    (runtime.session.useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (runtime.sync.useChannelSync as jest.Mock).mockReturnValue(undefined);
    (runtime.sync.isChannelRefused as jest.Mock).mockReturnValue(false);
    // The store's real subscribe; tests drive the verdict through `isChannelRefused` and re-render.
    (runtime.sync.subscribeRefusedChannels as jest.Mock).mockImplementation(() => () => undefined);
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
        // Regression: observeItem's first response only looks at the cache, so a room seen for
        // the first time gets an immediate null even while the fetch is still in flight. Taking
        // that as the final answer would send the caller away from the screen and cut off that
        // fetch too.
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
        // Removal is not an error — it's a normal situation where the caller should leave the screen.
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

    describe('seed (ADR-0058)', () => {
        it('시드가 있으면 관측 해소 전에도 즉시 렌더 가능한 채널을 준다', () => {
            const { result } = renderHook(() => useChannel('ch-1', { seed: channelRow({ name: '시드' }) }));

            // The observer hasn't given anything yet — shown immediately via the seed.
            expect(result.current.isLoading).toBe(false);
            expect(result.current.channel?.id).toBe('ch-1');
            expect(result.current.isError).toBe(false);
        });

        it('id가 다른 시드는 무시한다 — 남의 행으로 방을 그리지 않는다', () => {
            const { result } = renderHook(() => useChannel('ch-1', { seed: channelRow({ id: 'ch-OTHER' }) }));

            expect(result.current.isLoading).toBe(true);
            expect(result.current.channel).toBeNull();
        });

        it('관측이 해소되면 시드가 아니라 관측 값이 이긴다', async () => {
            const { result } = renderHook(() => useChannel('ch-1', { seed: channelRow({ name: '시드' }) }));

            act(() => emit(channelRow({ name: '실제' })));

            await waitFor(() => expect(result.current.channel?.name).toBe('실제'));
        });

        it('시드가 있으면 해소 타임아웃이 에러 화면으로 넘어가지 않는다', () => {
            // Swapping in an error page after 10 seconds while the screen already has content
            // would be worse than this timer's original purpose (blocking infinite loading) —
            // the seed is already content.
            jest.useFakeTimers();
            const { result } = renderHook(() => useChannel('ch-1', { seed: channelRow() }));

            act(() => emit(null));
            act(() => {
                jest.advanceTimersByTime(10_000);
            });

            expect(result.current.isError).toBe(false);
            expect(result.current.channel?.id).toBe('ch-1');
        });

        it('해소된 제거(행 소멸)는 시드보다 이긴다 — 호출부의 이탈 처리가 살아 있다', async () => {
            const { result } = renderHook(() => useChannel('ch-1', { seed: channelRow() }));

            act(() => emit(channelRow()));
            await waitFor(() => expect(result.current.channel).not.toBeNull());

            act(() => emit(null));

            expect(result.current.channel).toBeNull();
        });
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

        // The new room knows nothing yet — leaving the old row in place would show someone
        // else's room.
        expect(result.current.isLoading).toBe(true);
        expect(result.current.channel).toBeNull();

        // And the new room's first null is not taken to mean absence either.
        act(() => emit(null));
        expect(result.current.isLoading).toBe(true);
        expect(result.current.isError).toBe(false);
    });

    it('구독과 타이머를 언마운트에서 정리한다', () => {
        jest.useFakeTimers();
        const { unmount } = renderHook(() => useChannel('ch-1'));

        unmount();

        expect(unsubscribe).toHaveBeenCalled();
        // If the timer were still alive after unmount, it would call setState on a component that's gone.
        expect(jest.getTimerCount()).toBe(0);
    });

    it('소유자 판정과 멤버 수를 뷰모델로 옮긴다', async () => {
        const { result } = renderHook(() => useChannel('ch-1'));

        act(() => emit(channelRow({ ownerId: 'me', memberIds: ['me', 'you', 'them'] })));

        await waitFor(() => expect(result.current.channel).not.toBeNull());
        expect(result.current.channel?.isOwner).toBe(true);
        expect(result.current.channel?.memberCount).toBe(3);
    });

    // A refusal is an answer the server already gave, so the resolve timeout — which exists for a
    // fetch that might still land — must not stand between it and the screen.
    describe('서버가 거절한 채널', () => {
        it('기다리지 않고 거절로 답한다', () => {
            (runtime.sync.isChannelRefused as jest.Mock).mockReturnValue(true);

            const { result } = renderHook(() => useChannel('ch-1'));

            expect(result.current.isForbidden).toBe(true);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isError).toBe(false);
        });

        // Two different facts, two different sentences: one is something we know, the other is what
        // we say when we do not. Folding them together would put "you are not in this" on a dropped
        // connection.
        it('불러오기 실패와 섞이지 않는다', () => {
            const { result } = renderHook(() => useChannel('ch-1'));

            expect(result.current.isForbidden).toBe(false);
        });

        // A cached row means the screen has something to show, and what happens to it belongs to the
        // removal path — a refusal arriving late must not blank a room that is rendering.
        it('보여 줄 행이 이미 있으면 말하지 않는다', async () => {
            (runtime.sync.isChannelRefused as jest.Mock).mockReturnValue(true);

            const { result } = renderHook(() => useChannel('ch-1'));
            act(() => emit(channelRow()));

            await waitFor(() => expect(result.current.channel?.id).toBe('ch-1'));
            expect(result.current.isForbidden).toBe(false);
        });
    });
});
