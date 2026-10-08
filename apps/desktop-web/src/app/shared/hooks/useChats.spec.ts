import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

type Row = { id: string; channelId: string; chatNo: number };

// What the cache holds and where the room's prime stands; each test sets both.
const state = vi.hoisted(() => ({
    rows: [] as Row[],
    prime: 'pending' as 'pending' | 'ready' | 'failed',
    isVerified: true,
    cloudId: 'cloud-a',
    retryPrime: vi.fn(),
    emit: (_rows: Row[]) => undefined,
    // Hold the next subscription's first emission, as the cache does between a page landing and the
    // widened window being read back; `flushEmission` delivers it.
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

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId: state.cloudId }),
        },
        connection: { useRuntimeSocketState: () => ({ isVerified: state.isVerified }) },
        sync: { useChatSync: () => ({ prime: state.prime, retryPrime: state.retryPrime }) },
    },
}));

import { useChats } from './useChats';

afterEach(() => {
    // A test that fails between holding an emission and releasing it must not leave the next one deferred.
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

// The thread panel pages the feed by this result, so a failed page has to be told apart from a page
// that simply had nothing more.
describe('useChats loadOlder', () => {
    // A room's paging depth is remembered for the session, so each test pages a room of its own.
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

    // The scroll handler fires again and again at the top, and `isLoadingOlder` is state the handler read
    // before the first call's render: two calls in a tick both saw it false and both asked for the page.
    it('asks for a page once when it is called twice in the same tick', async () => {
        refreshList.mockResolvedValue({ fetchedCount: 50 });
        const { result } = renderHook(() => useChats('C-tick'));

        await act(async () => {
            await Promise.all([result.current.loadOlder(), result.current.loadOlder()]);
        });

        expect(refreshList).toHaveBeenCalledTimes(1);
    });

    // A landed page widens the window, and the cache reads the older rows back a moment later. In that
    // gap the oldest row is still the old cursor, so asking again would fetch the page just fetched.
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

    // The hook is not remounted when the channel changes, so a page still out for the channel just left
    // must not stand in the way of the one now on screen.
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
    });
});

// A second consumer of a room (the thread panel) pages its own replies back. What it saved would widen
// the room the next time it opens, so it must not save.
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

    // One account in two clouds can show the same uid, and each cloud's Self Channel then has the same id,
    // so the remembered window cannot be keyed by uid and channel alone: a short channel in one cloud that
    // ran out of history would tell the same-named channel of another cloud there is nothing older.
    // The cache observer is bound to the cloud when it subscribes, so the hook has to subscribe again when
    // the cloud changes under an unchanged uid and channel id, or it would wait on a feed nobody fills.
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
