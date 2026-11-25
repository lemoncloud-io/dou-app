import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

type Row = { id: string; channelId: string; chatNo: number };

const state = vi.hoisted(() => ({
    rows: [] as Row[],
    prime: 'pending' as 'pending' | 'ready' | 'failed',
    isVerified: true,
    cloudId: 'cloud-a',
    retryPrime: vi.fn(),
    emit: (_rows: Row[]) => undefined,
    deferEmission: false,
    flushEmission: () => undefined,
}));
const observeList = vi.fn((_query: unknown, onChange: (result: { list: Row[] }) => void) => {
    state.emit = rows => onChange({ list: rows });
    if (state.deferEmission) state.flushEmission = () => onChange({ list: state.rows });
    else onChange({ list: state.rows });
    return () => undefined;
});
const refreshList = vi.fn((_query: unknown) => Promise.resolve({ fetchedCount: 0 }));
const repositories = { chat: { observeList, refreshList } };
const warn = vi.fn();

vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: { useRuntimeRepositories: () => repositories },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: state.cloudId }),
        },
        connection: { useRuntimeSocketState: () => ({ isVerified: state.isVerified }) },
        sync: { useChatSync: () => ({ prime: state.prime, retryPrime: state.retryPrime }) },
    })
);

import { useChats } from './useChats';

afterEach(() => {
    state.deferEmission = false;
});

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

describe('useChats freshness bridge', () => {
    beforeEach(() => {
        state.rows = [{ id: 'C1:1', channelId: 'C1', chatNo: 1 }];
        state.prime = 'ready';
        state.isVerified = true;
        refreshList.mockReset().mockResolvedValue({ fetchedCount: 0 });
        warn.mockClear();
    });

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

        expect(refreshList).toHaveBeenCalledTimes(2);
    });
});

describe('useChats loadOlder', () => {
    beforeEach(() => {
        state.rows = [{ id: 'C1:60', channelId: 'C1', chatNo: 60 }];
        state.prime = 'ready';
        refreshList.mockReset();
    });

    it('fetches the page before the oldest cached row and resolves true', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-page'));

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.loadOlder();
        });

        expect(ok).toBe(true);
        expect(refreshList).toHaveBeenCalledWith({ channelId: 'C-page', cursorNo: 60, limit: 50 });
    });

    it('resolves true and stops paging when the server has nothing older', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 0 });
        const { result } = renderHook(() => useChats('C-end'));

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.loadOlder();
        });

        expect(ok).toBe(true);
        expect(result.current.hasMore).toBe(false);
    });

    it('asks for a page once when it is called twice in the same tick', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-tick'));

        await act(async () => {
            await Promise.all([result.current.loadOlder(), result.current.loadOlder()]);
        });

        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    it('does not ask for the same page again before the widened window has been read back', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-gap'));

        state.deferEmission = true;
        await act(async () => {
            await result.current.loadOlder();
        });
        await act(async () => {
            await result.current.loadOlder();
        });
        expect(refreshList).toHaveBeenCalledTimes(1);

        state.deferEmission = false;
        act(() => state.flushEmission());
        await act(async () => {
            await result.current.loadOlder();
        });
        expect(refreshList).toHaveBeenCalledTimes(2);
    });

    it("asks for the new channel's page while the old channel's page is still in flight", async () => {
        let landOldPage: (value: { fetchedCount: number }) => void = () => undefined;
        refreshList.mockImplementationOnce(() => new Promise(resolve => (landOldPage = resolve)));
        refreshList.mockResolvedValue({ fetchedCount: 50 });
        const { result, rerender } = renderHook(({ id }) => useChats(id), { initialProps: { id: 'C-from' } });

        let oldPage: Promise<boolean> | undefined;
        act(() => {
            oldPage = result.current.loadOlder();
        });
        rerender({ id: 'C-to' });
        await act(async () => {
            await result.current.loadOlder();
        });

        expect(refreshList).toHaveBeenLastCalledWith({ channelId: 'C-to', cursorNo: 60, limit: 50 });
        await act(async () => {
            landOldPage({ fetchedCount: 50 });
            await oldPage;
        });
    });

    it('asks again for a page that failed', async () => {
        refreshList.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-retry'));

        await act(async () => {
            await result.current.loadOlder();
        });
        await act(async () => {
            await result.current.loadOlder();
        });

        expect(refreshList).toHaveBeenCalledTimes(2);
    });

    it('resolves false when the page fetch fails, and keeps paging possible', async () => {
        refreshList.mockRejectedValue(new Error('network'));
        const { result } = renderHook(() => useChats('C-fail'));

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.loadOlder();
        });

        expect(ok).toBe(false);
        expect(result.current.hasMore).toBe(true);
        expect(result.current.isLoadingOlder).toBe(false);
        expect(result.current.loadOlderFailed).toBe(true);
    });

    it('pages on past a page of nothing but deleted messages', async () => {
        refreshList
            .mockResolvedValueOnce({ fetchedCount: 0, cursorNo: 10 })
            .mockResolvedValueOnce({ fetchedCount: 4, cursorNo: 0 });
        const { result } = renderHook(() => useChats('C-deleted'));

        await act(async () => {
            await result.current.loadOlder();
        });

        expect(refreshList).toHaveBeenNthCalledWith(1, { channelId: 'C-deleted', cursorNo: 60, limit: 50 });
        expect(refreshList).toHaveBeenNthCalledWith(2, { channelId: 'C-deleted', cursorNo: 10, limit: 50 });
        expect(result.current.hasMore).toBe(false);
    });

    it('clears the older-page failure when the next page lands', async () => {
        refreshList.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-fail-then-ok'));

        await act(async () => {
            await result.current.loadOlder();
        });
        expect(result.current.loadOlderFailed).toBe(true);

        state.rows = [
            { id: 'C-fail-then-ok:10', channelId: 'C-fail-then-ok', chatNo: 10 },
            { id: 'C-fail-then-ok:60', channelId: 'C-fail-then-ok', chatNo: 60 },
        ];
        act(() => state.emit(state.rows));
        await act(async () => {
            await result.current.loadOlder();
        });
        expect(result.current.loadOlderFailed).toBe(false);
    });
});

describe('useChats paging with nothing shown', () => {
    beforeEach(() => {
        state.rows = [];
        state.prime = 'ready';
        refreshList.mockReset();
    });

    it('counts down from the channel head when no row is shown', async () => {
        refreshList.mockImplementation(async (query: { cursorNo?: number }) =>
            query.cursorNo === 121 ? { fetchedCount: 0, cursorNo: 71 } : { fetchedCount: 3, cursorNo: 20 }
        );
        const { result } = renderHook(() => useChats('C-head', 120));

        await act(async () => {
            await result.current.loadOlder();
        });

        const cursors = refreshList.mock.calls.map(([query]) => (query as { cursorNo?: number }).cursorNo);
        expect(cursors.filter(Boolean)).toEqual([121, 71]);
        expect(result.current.hasMore).toBe(true);
    });

    it('walks every page of deleted messages in one call, so a caller that saw nothing land is not stranded', async () => {
        refreshList.mockImplementation(async (query: { cursorNo?: number }) => {
            const cursor = query.cursorNo ?? 0;
            return cursor > 50 ? { fetchedCount: 0, cursorNo: cursor - 50 } : { fetchedCount: 2, cursorNo: 0 };
        });
        const { result } = renderHook(() => useChats('C-long-gap', 349));

        await act(async () => {
            await result.current.loadOlder();
        });

        const cursors = refreshList.mock.calls.map(([query]) => (query as { cursorNo?: number }).cursorNo);
        expect(cursors.filter(Boolean)).toEqual([350, 300, 250, 200, 150, 100, 50]);
        expect(result.current.hasMore).toBe(false);
    });

    it('stops on a cursor that does not move down', async () => {
        refreshList.mockImplementation(async (query: { cursorNo?: number }) =>
            query.cursorNo ? { fetchedCount: 0, cursorNo: query.cursorNo } : { fetchedCount: 0 }
        );
        const { result } = renderHook(() => useChats('C-stuck', 40));

        await act(async () => {
            await result.current.loadOlder();
        });

        expect(refreshList.mock.calls.filter(([query]) => (query as { cursorNo?: number }).cursorNo)).toHaveLength(1);
        expect(result.current.hasMore).toBe(false);
    });

    it('ends the history when every message down to the start was deleted', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 0, cursorNo: 0 });
        const { result } = renderHook(() => useChats('C-all-gone', 3));

        await act(async () => {
            await result.current.loadOlder();
        });

        expect(result.current.hasMore).toBe(false);
    });

    it('has no history to page in a room nobody has written in', () => {
        const { result } = renderHook(() => useChats('C-new'));

        expect(result.current.hasMore).toBe(false);
    });

    it('starts the next page from the cursor the server named, not the oldest row shown', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 2, cursorNo: 30 });
        state.rows = [{ id: 'C-floor:80', channelId: 'C-floor', chatNo: 80 }];
        const { result } = renderHook(() => useChats('C-floor'));

        await act(async () => {
            await result.current.loadOlder();
        });
        state.rows = [
            { id: 'C-floor:50', channelId: 'C-floor', chatNo: 50 },
            { id: 'C-floor:80', channelId: 'C-floor', chatNo: 80 },
        ];
        act(() => state.emit(state.rows));
        await act(async () => {
            await result.current.loadOlder();
        });

        expect(refreshList).toHaveBeenNthCalledWith(2, { channelId: 'C-floor', cursorNo: 30, limit: 50 });
    });
});

describe('useChats window depth', () => {
    beforeEach(() => {
        state.rows = [{ id: 'C1:60', channelId: 'C1', chatNo: 60 }];
        state.prime = 'ready';
        refreshList.mockReset().mockResolvedValue({ fetchedCount: 50 });
        observeList.mockClear();
        state.cloudId = 'cloud-a';
    });

    const lastLimit = () => (observeList.mock.calls.at(-1)?.[0] as { limit: number }).limit;

    it('keeps a widened window for the next time the room opens', async () => {
        const first = renderHook(() => useChats('C-kept'));
        await act(async () => {
            await first.result.current.loadOlder();
        });
        first.unmount();

        renderHook(() => useChats('C-kept'));

        expect(lastLimit()).toBe(100);
    });

    it('does not keep a window widened by an instance that opted out', async () => {
        const panel = renderHook(() => useChats('C-panel', undefined, { persist: false }));
        await act(async () => {
            await panel.result.current.loadOlder();
        });
        expect(lastLimit()).toBe(100);
        panel.unmount();

        renderHook(() => useChats('C-panel'));

        expect(lastLimit()).toBe(50);
    });

    it('subscribes again when the cloud changes under the same channel id', () => {
        const { rerender } = renderHook(() => useChats('C-resub'));
        const before = observeList.mock.calls.length;

        state.cloudId = 'cloud-b';
        rerender();

        expect(observeList.mock.calls.length).toBeGreaterThan(before);
    });

    it('does not carry a window from the same channel id in another cloud', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 0 });
        const inA = renderHook(() => useChats('C-self'));
        await act(async () => {
            await inA.result.current.loadOlder();
        });
        expect(inA.result.current.hasMore).toBe(false);
        inA.unmount();

        state.cloudId = 'cloud-b';
        const inB = renderHook(() => useChats('C-self'));

        expect(inB.result.current.hasMore).toBe(true);
    });
});
