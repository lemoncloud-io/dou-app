import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

type Row = { id: string; channelId: string; chatNo: number };

// What the cache holds and where the room's prime stands; each test sets both.
const state = vi.hoisted(() => ({
    rows: [] as Row[],
    prime: 'pending' as 'pending' | 'ready' | 'failed',
    isVerified: true,
    retryPrime: vi.fn(),
}));
const observeList = vi.fn((_query: unknown, onChange: (result: { list: Row[] }) => void) => {
    onChange({ list: state.rows });
    return () => undefined;
});
const repositories = { chat: { observeList, refreshList: vi.fn(() => Promise.resolve({ fetchedCount: 0 })) } };

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
