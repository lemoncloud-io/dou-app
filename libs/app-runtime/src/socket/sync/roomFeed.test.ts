import {
    clearActivePerfTrace,
    configurePerfTraces,
    resetPerfTraces,
    setActivePerfTrace,
    startPerfTrace,
} from '@chatic/perf';

import { fetchRoomFeed, prefetchRoomFeed, resetRoomFeeds } from './roomFeed';

const mockRefreshList = jest.fn();
const mockCacheReadList = jest.fn();
const mockGetScopedRepositories = jest.fn((_cid: string) => ({
    chat: { refreshList: mockRefreshList, cacheReadList: mockCacheReadList },
}));
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({ getScopedRepositories: mockGetScopedRepositories }),
}));

const mockIsSlotVerified = jest.fn();
jest.mock('../runtime', () => ({
    getSocketManager: () => ({ isSlotVerified: mockIsSlotVerified }),
}));

const mockDisposeChat = jest.fn();
const mockRegisterChat = jest.fn(() => mockDisposeChat);
jest.mock('./runtime', () => ({
    getSyncManager: () => ({ registerChat: mockRegisterChat }),
}));

const backend = { start: jest.fn(), stop: jest.fn() };

const page = (fetchedCount: number) => ({ fetchedCount, latestNo: fetchedCount, total: fetchedCount });

/** A refreshList whose answer the test releases, so callers can arrive while it is in flight. */
const deferredRefresh = () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    let reject!: (error: Error) => void;
    mockRefreshList.mockImplementationOnce(
        (_query: unknown, options?: { onFetched?: () => void }) =>
            new Promise((res, rej) => {
                resolve = value => {
                    options?.onFetched?.();
                    res(value);
                };
                reject = rej;
            })
    );
    return { resolve: (value: ReturnType<typeof page>) => resolve(value), reject: (e: Error) => reject(e) };
};

const beginSync = () => {
    const trace = startPerfTrace('chat_room_sync');
    setActivePerfTrace('chat_room_sync', 'ch-1', trace);
    return trace;
};

beforeEach(() => {
    jest.clearAllMocks();
    resetRoomFeeds();
    configurePerfTraces(backend);
    mockRefreshList.mockImplementation(async (_query: unknown, options?: { onFetched?: () => void }) => {
        options?.onFetched?.();
        return page(20);
    });
    mockCacheReadList.mockResolvedValue({ list: [] });
    mockIsSlotVerified.mockReturnValue(true);
});

afterEach(() => {
    clearActivePerfTrace('chat_room_sync');
    resetPerfTraces();
    jest.useRealTimers();
});

describe('fetchRoomFeed', () => {
    it('sends one request for callers that arrive while it is in flight', async () => {
        const { resolve } = deferredRefresh();

        const first = fetchRoomFeed('cloud-a', 'ch-1');
        const second = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'hit' });
        resolve(page(5));

        await expect(Promise.all([first, second])).resolves.toEqual([page(5), page(5)]);
        expect(mockRefreshList).toHaveBeenCalledTimes(1);
        expect(mockGetScopedRepositories).toHaveBeenCalledWith('cloud-a');
    });

    it('keeps rooms and clouds apart', async () => {
        await Promise.all([
            fetchRoomFeed('cloud-a', 'ch-1'),
            fetchRoomFeed('cloud-a', 'ch-2'),
            fetchRoomFeed('cloud-b', 'ch-1'),
        ]);

        expect(mockRefreshList).toHaveBeenCalledTimes(3);
    });

    it('answers from a fetch that finished a moment ago, and fetches again once that has passed', async () => {
        jest.useFakeTimers({ now: 1_000_000 });
        await fetchRoomFeed('cloud-a', 'ch-1');

        jest.setSystemTime(1_000_000 + 1_999);
        await fetchRoomFeed('cloud-a', 'ch-1');
        expect(mockRefreshList).toHaveBeenCalledTimes(1);

        jest.setSystemTime(1_000_000 + 2_000);
        await fetchRoomFeed('cloud-a', 'ch-1');
        expect(mockRefreshList).toHaveBeenCalledTimes(2);
    });

    it('forgets a failed fetch, so the next caller sends a new request', async () => {
        mockRefreshList.mockRejectedValueOnce(new Error('socket closed'));

        await expect(fetchRoomFeed('cloud-a', 'ch-1')).rejects.toThrow('socket closed');
        await expect(fetchRoomFeed('cloud-a', 'ch-1')).resolves.toEqual(page(20));
        expect(mockRefreshList).toHaveBeenCalledTimes(2);
    });

    it('marks the phases of the trace it takes, in order', async () => {
        jest.useFakeTimers({ now: 0 });
        const trace = beginSync();
        const { resolve } = deferredRefresh();

        const pending = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'miss' });
        resolve(page(20));
        await pending;
        trace.stop();

        const [record] = backend.stop.mock.calls[0];
        expect(record.attributes).toMatchObject({ cache: 'miss' });
        expect(record.metrics).toMatchObject({ fetched: 20, latest_no: 20 });
        expect(record.metrics.feed_sent).toBeLessThanOrEqual(record.metrics.feed_received);
        expect(record.metrics.feed_received).toBeLessThanOrEqual(record.metrics.feed_done);
    });

    it('lets a caller that joined leave the trace as the first caller described it', async () => {
        const trace = beginSync();
        const { resolve } = deferredRefresh();

        const first = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'miss' });
        const joined = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'hit' });
        resolve(page(20));
        await Promise.all([first, joined]);
        trace.stop();

        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ cache: 'miss' });
    });

    it('leaves a trace an earlier fetch already took', async () => {
        const trace = beginSync();
        trace.putAttribute('cache', 'hit');
        trace.mark('feed_sent');

        await fetchRoomFeed('cloud-a', 'ch-1', { cache: 'miss' });
        trace.stop();

        const [record] = backend.stop.mock.calls[0];
        expect(record.attributes).toMatchObject({ cache: 'hit' });
        expect(record.metrics).not.toHaveProperty('fetched');
    });

    it('ends its trace as synced when the page wrote nothing, since no list emission will follow', async () => {
        beginSync();
        mockRefreshList.mockResolvedValueOnce(page(0));

        await fetchRoomFeed('cloud-a', 'ch-1');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ outcome: 'synced' });
    });

    it('ends its trace as error when its fetch fails', async () => {
        beginSync();
        mockRefreshList.mockRejectedValueOnce(new Error('socket closed'));

        await expect(fetchRoomFeed('cloud-a', 'ch-1')).rejects.toThrow();

        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ outcome: 'error' });
    });

    it('lets a second tap on the room take its own trace for the fetch still in flight', async () => {
        const first = beginSync();
        const { resolve } = deferredRefresh();
        const pending = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'hit' });
        // The second tap begins a new trace before the first fetch has answered.
        const second = beginSync();

        const joined = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'hit' });
        resolve(page(0));
        await Promise.all([pending, joined]);

        expect(mockRefreshList).toHaveBeenCalledTimes(1);
        expect(second.hasMetric('feed_sent')).toBe(true);
        expect(second.hasMetric('feed_received')).toBe(true);
        // An empty page ends both, the way the first fetch's own trace ends.
        expect(backend.stop.mock.calls.map(([record]) => record.id)).toEqual(
            expect.arrayContaining([first.id, second.id])
        );
    });

    it('gives a trace no fetch took a request of its own, rather than an answer from before it began', async () => {
        await fetchRoomFeed('cloud-a', 'ch-1');
        const trace = beginSync();

        await fetchRoomFeed('cloud-a', 'ch-1', { cache: 'hit' });

        expect(mockRefreshList).toHaveBeenCalledTimes(2);
        expect(trace.hasMetric('feed_done')).toBe(true);
    });

    it('sends a new request for a fresh caller, even with one in flight', async () => {
        const { resolve } = deferredRefresh();
        const pending = fetchRoomFeed('cloud-a', 'ch-1');

        await fetchRoomFeed('cloud-a', 'ch-1', { fresh: true });
        resolve(page(1));
        await pending;

        expect(mockRefreshList).toHaveBeenCalledTimes(2);
    });

    it('does not end a trace another fetch took when its own fetch fails', async () => {
        const trace = beginSync();
        trace.mark('feed_sent');
        mockRefreshList.mockRejectedValueOnce(new Error('socket closed'));

        await expect(fetchRoomFeed('cloud-a', 'ch-1')).rejects.toThrow();

        expect(backend.stop).not.toHaveBeenCalled();
    });
});

describe('prefetchRoomFeed', () => {
    it('starts nothing while the cloud socket is not verified', async () => {
        mockIsSlotVerified.mockReturnValue(false);

        await prefetchRoomFeed('cloud-a', 'ch-1');

        expect(mockRegisterChat).not.toHaveBeenCalled();
        expect(mockCacheReadList).not.toHaveBeenCalled();
        expect(mockRefreshList).not.toHaveBeenCalled();
    });

    it("registers the room's chat target before the request, leaving it in its grace", async () => {
        await prefetchRoomFeed('cloud-a', 'ch-1');

        expect(mockRegisterChat).toHaveBeenCalledWith('ch-1', undefined, { cid: 'cloud-a' });
        expect(mockDisposeChat).toHaveBeenCalledTimes(1);
        expect(mockRegisterChat.mock.invocationCallOrder[0]).toBeLessThan(mockRefreshList.mock.invocationCallOrder[0]);
    });

    it('records a room with cached rows as a cache hit', async () => {
        mockCacheReadList.mockResolvedValue({ list: [{ chatNo: 4 }] });
        const trace = beginSync();

        await prefetchRoomFeed('cloud-a', 'ch-1');
        trace.stop();

        expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' }, expect.anything());
        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ cache: 'hit' });
    });

    it('records an empty room as a cache miss', async () => {
        const trace = beginSync();

        await prefetchRoomFeed('cloud-a', 'ch-1');
        trace.stop();

        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ cache: 'miss' });
    });

    it('sends the request without waiting for the cache read', async () => {
        // A read that never answers must not hold the request back.
        mockCacheReadList.mockReturnValue(new Promise(() => undefined));

        await prefetchRoomFeed('cloud-a', 'ch-1');

        expect(mockRefreshList).toHaveBeenCalledTimes(1);
        expect(mockCacheReadList.mock.invocationCallOrder[0]).toBeLessThan(mockRefreshList.mock.invocationCallOrder[0]);
    });

    it('still fetches when the cache read fails, leaving the trace without a cache state', async () => {
        mockCacheReadList.mockRejectedValue(new Error('bridge timeout'));
        const trace = beginSync();

        await prefetchRoomFeed('cloud-a', 'ch-1');
        trace.stop();

        expect(mockRefreshList).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).not.toHaveProperty('cache');
    });

    it("shares one request with the room's own sync", async () => {
        const { resolve } = deferredRefresh();

        const tap = prefetchRoomFeed('cloud-a', 'ch-1');
        const room = fetchRoomFeed('cloud-a', 'ch-1', { cache: 'miss' });
        resolve(page(3));
        await Promise.all([tap, room]);

        expect(mockRefreshList).toHaveBeenCalledTimes(1);
    });

    it('never rejects, so a failed tap leaves the room to fetch on its own', async () => {
        mockRefreshList.mockRejectedValueOnce(new Error('socket closed'));

        await expect(prefetchRoomFeed('cloud-a', 'ch-1')).resolves.toBeUndefined();
    });
});
