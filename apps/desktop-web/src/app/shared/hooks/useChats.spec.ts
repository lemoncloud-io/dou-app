import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

type Row = { id: string; channelId: string; chatNo: number };

// What the cache holds and where the room's prime stands; each test sets both.
const state = vi.hoisted(() => ({
    rows: [] as Row[],
    prime: 'pending' as 'pending' | 'ready' | 'failed',
    isVerified: true,
    retryPrime: vi.fn(),
    emit: (_rows: Row[]) => undefined,
}));
const observeList = vi.fn((_query: unknown, onChange: (result: { list: Row[] }) => void) => {
    state.emit = rows => onChange({ list: rows });
    onChange({ list: state.rows });
    return () => undefined;
});
const refreshList = vi.fn((_query: unknown) => Promise.resolve({ fetchedCount: 0 }));
const repositories = { chat: { observeList, refreshList } };
const warn = vi.fn();

vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: { useSessionIdentity: () => ({ userId: 'me' }) },
        connection: { useRuntimeSocketState: () => ({ isVerified: state.isVerified }) },
        sync: { useChatSync: () => ({ prime: state.prime, retryPrime: state.retryPrime }) },
    },
}));

import { useChats } from './useChats';

describe('useChats on a room with nothing cached', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        state.rows = [];
        state.prime = 'pending';
        state.isVerified = true;
        state.retryPrime.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    // The cache reads empty before the first page lands; that is not an empty room.
    it('keeps loading while the first page is on its way', () => {
        const { result } = renderHook(() => useChats('C1'));

        act(() => {
            vi.advanceTimersByTime(10_000);
        });

        expect(result.current.isLoading).toBe(true);
        expect(result.current.loadFailed).toBe(false);
    });

    it('trusts an empty room once the first page is in and the list had time to re-read', () => {
        const { result, rerender } = renderHook(() => useChats('C1'));

        state.prime = 'ready';
        rerender();
        expect(result.current.isLoading).toBe(true);

        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadFailed).toBe(false);
    });

    it('reports a failed first page and hands the retry to the prime', () => {
        state.prime = 'failed';
        const { result } = renderHook(() => useChats('C1'));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadFailed).toBe(true);

        act(() => result.current.retryLoad());
        expect(state.retryPrime).toHaveBeenCalledTimes(1);
    });

    // A wedged socket never verifies, so the prime never runs: the skeleton must not spin for good.
    it('gives up on a socket that never verifies', () => {
        state.isVerified = false;
        const { result } = renderHook(() => useChats('C1'));
        expect(result.current.isLoading).toBe(true);

        act(() => {
            vi.advanceTimersByTime(4000);
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadFailed).toBe(true);
    });

    it('shows cached messages at once, whatever the prime says', () => {
        state.rows = [{ id: 'C1:1', channelId: 'C1', chatNo: 1 }];
        const { result } = renderHook(() => useChats('C1'));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadFailed).toBe(false);
        expect(result.current.messages).toHaveLength(1);
    });
});

// The channel record runs ahead of the cache, so the feed's newest page is fetched. The guard that
// stops a settled target being re-fetched every render must not outlive a fetch that failed.
describe('useChats freshness bridge', () => {
    beforeEach(() => {
        state.rows = [{ id: 'C1:1', channelId: 'C1', chatNo: 1 }];
        state.prime = 'ready';
        state.isVerified = true;
        refreshList.mockReset().mockResolvedValue({ fetchedCount: 0 });
        warn.mockClear();
    });

    // `chats` is an effect dependency, so a cache emission is the next chance the effect gets.
    const nextChance = () => act(async () => state.emit([...state.rows]));

    it('fetches the newest page once for a target and not again after it succeeded', async () => {
        renderHook(() => useChats('C1', 5));
        await act(async () => undefined);
        await nextChance();

        expect(refreshList).toHaveBeenCalledTimes(1);
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'C1', limit: 50 });
    });

    it('logs a failed fetch and tries the same latestChatNo again on the next chance', async () => {
        refreshList.mockRejectedValueOnce(new Error('offline'));
        renderHook(() => useChats('C1', 5));
        await act(async () => undefined);

        expect(warn).toHaveBeenCalledWith(
            'CHAT',
            expect.stringContaining('refresh'),
            expect.objectContaining({ channelId: 'C1', latestChatNo: 5 })
        );

        await nextChance();
        expect(refreshList).toHaveBeenCalledTimes(2);

        // That retry succeeded, so the target is settled again.
        await nextChance();
        expect(refreshList).toHaveBeenCalledTimes(2);
    });

    it('does not loop on a failure: nothing re-runs the effect until something changes', async () => {
        refreshList.mockRejectedValue(new Error('offline'));
        renderHook(() => useChats('C1', 5));
        await act(async () => undefined);
        await act(async () => undefined);

        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    it('keeps the guard of a newer target when an older fetch fails late', async () => {
        let failOld: (error: Error) => void = () => undefined;
        refreshList.mockImplementationOnce(() => new Promise((_resolve, reject) => (failOld = reject)));
        const { rerender } = renderHook(({ no }) => useChats('C1', no), { initialProps: { no: 5 } });
        await act(async () => undefined);

        rerender({ no: 6 });
        await act(async () => undefined);
        expect(refreshList).toHaveBeenCalledTimes(2);

        await act(async () => failOld(new Error('late')));
        await nextChance();

        // The newer target (6) was fetched and succeeded; the stale failure must not reopen it.
        expect(refreshList).toHaveBeenCalledTimes(2);
    });
});
