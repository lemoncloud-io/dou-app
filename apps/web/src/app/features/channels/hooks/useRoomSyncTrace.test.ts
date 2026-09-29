import { renderHook } from '@testing-library/react';

import { configurePerfTraces, getActivePerfTrace, resetPerfTraces } from '@chatic/perf';

import { roomOpenTrace } from '../../../runtime/perf';
import {
    ROOM_SYNC_LEAVE_GRACE_MS,
    ROOM_SYNC_TIMEOUT_MS,
    resetParkedRoomSyncTraces,
    useRoomSyncTrace,
} from './useRoomSyncTrace';

import type { DomainChat } from '@chatic/data';
import type { PerfTrace, PerfTraceBackend } from '@chatic/perf';
import type { UseRoomSyncTraceParams } from './useRoomSyncTrace';

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

const chats = (upTo: number): DomainChat[] =>
    Array.from({ length: upTo }, (_, i) => ({ id: `ch_1:${i + 1}`, chatNo: i + 1 }) as DomainChat);

const render = (initial: UseRoomSyncTraceParams) =>
    renderHook((props: UseRoomSyncTraceParams) => useRoomSyncTrace(props), { initialProps: initial });

const syncStops = () =>
    backend.stop.mock.calls.map(([result]) => result).filter(result => result.name === 'chat_room_sync');

/** A tap into the room, claimed by its page — what `roomOpenTrace.begin` + the open hook leave. */
const tapAndClaim = (channelId = 'ch_1'): PerfTrace => {
    roomOpenTrace.begin(channelId, 'list');
    const sync = getActivePerfTrace('chat_room_sync', channelId);
    roomOpenTrace.claim(channelId);
    if (!sync) throw new Error('no sync trace');
    return sync;
};

/** The sync writing the latest page, as the sync hooks mark it. */
const feedDone = (trace: PerfTrace, latestNo: number) => {
    trace.putMetric('latest_no', latestNo);
    trace.mark('feed_done');
};

const hide = () => {
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    roomOpenTrace.reset();
    resetParkedRoomSyncTraces();
    configurePerfTraces(backend);
});

afterEach(() => {
    roomOpenTrace.reset();
    resetPerfTraces();
    jest.useRealTimers();
});

describe('useRoomSyncTrace', () => {
    it('records nothing for a room no tap began a sync trace for', () => {
        const { rerender } = render({ channelId: 'ch_1', rawChats: [] });
        rerender({ channelId: 'ch_1', rawChats: chats(3) });

        expect(syncStops()).toHaveLength(0);
    });

    it('does not adopt a sync trace whose open trace this mount did not claim', () => {
        // Begun for a room already on screen, or for a navigation that never arrived.
        roomOpenTrace.begin('ch_1', 'list');
        const stale = getActivePerfTrace('chat_room_sync', 'ch_1');

        const { rerender } = render({ channelId: 'ch_1', rawChats: [] });
        if (stale) feedDone(stale, 3);
        rerender({ channelId: 'ch_1', rawChats: chats(3) });

        expect(syncStops()).toHaveLength(0);
    });

    it('does not end on a list emission before the sync fetched the latest page', () => {
        tapAndClaim();
        const { rerender } = render({ channelId: 'ch_1', rawChats: [] });

        // The cache's own emission — the room drew, but not yet synced.
        rerender({ channelId: 'ch_1', rawChats: chats(3) });

        expect(syncStops()).toHaveLength(0);
    });

    it('ends as synced once the window holds the fetched page’s newest row', () => {
        const trace = tapAndClaim();
        const { rerender } = render({ channelId: 'ch_1', rawChats: chats(3) });

        feedDone(trace, 5);
        rerender({ channelId: 'ch_1', rawChats: chats(5) });

        expect(syncStops()).toHaveLength(1);
        expect(syncStops()[0]).toMatchObject({
            attributes: { entry: 'list', outcome: 'synced' },
            metrics: expect.objectContaining({ mount: expect.any(Number), latest_no: 5, message_count: 5 }),
        });
        expect(getActivePerfTrace('chat_room_sync', 'ch_1')).toBeUndefined();
    });

    it('does not end on a window change that happens before the fetched page lands', () => {
        const trace = tapAndClaim();
        const { rerender } = render({ channelId: 'ch_1', rawChats: chats(3) });

        feedDone(trace, 5);
        // A new window for another reason (a join cursor arriving), still without row 5.
        rerender({ channelId: 'ch_1', rawChats: chats(3).slice(1) });
        expect(syncStops()).toHaveLength(0);

        rerender({ channelId: 'ch_1', rawChats: chats(5) });
        expect(syncStops()).toHaveLength(1);
    });

    it('ends as timeout when no synced page arrives in time', () => {
        tapAndClaim();
        render({ channelId: 'ch_1', rawChats: [] });

        jest.advanceTimersByTime(ROOM_SYNC_TIMEOUT_MS);

        expect(syncStops()[0].attributes).toMatchObject({ outcome: 'timeout' });
    });

    it('ends as background when the app leaves the foreground first', () => {
        tapAndClaim();
        render({ channelId: 'ch_1', rawChats: [] });

        hide();

        expect(syncStops()[0].attributes).toMatchObject({ outcome: 'background' });
    });

    it('ends as left once the grace window passes after the room unmounts', () => {
        tapAndClaim();
        const { unmount } = render({ channelId: 'ch_1', rawChats: [] });

        unmount();
        expect(syncStops()).toHaveLength(0);
        jest.advanceTimersByTime(ROOM_SYNC_LEAVE_GRACE_MS);

        expect(syncStops()[0].attributes).toMatchObject({ outcome: 'left' });
    });

    it('closes a parked trace as left at once when the app is hidden inside the grace window', () => {
        tapAndClaim();
        const { unmount } = render({ channelId: 'ch_1', rawChats: [] });
        unmount();

        hide();

        expect(syncStops()).toHaveLength(1);
        expect(syncStops()[0].attributes).toMatchObject({ outcome: 'left' });
    });

    it('carries on the same trace when the room remounts inside the grace window', () => {
        const trace = tapAndClaim();
        const first = render({ channelId: 'ch_1', rawChats: [] });
        first.unmount();

        const second = render({ channelId: 'ch_1', rawChats: [] });
        jest.advanceTimersByTime(ROOM_SYNC_LEAVE_GRACE_MS * 2);
        expect(syncStops()).toHaveLength(0);

        feedDone(trace, 1);
        second.rerender({ channelId: 'ch_1', rawChats: chats(1) });

        expect(syncStops()).toHaveLength(1);
        expect(syncStops()[0].attributes).toMatchObject({ outcome: 'synced' });
    });

    it('takes a fresh tap over a trace still parked from leaving, which ends as left', () => {
        const old = tapAndClaim();
        const first = render({ channelId: 'ch_1', rawChats: [] });
        first.unmount();

        const fresh = tapAndClaim();
        render({ channelId: 'ch_1', rawChats: [] });

        expect(syncStops()).toHaveLength(1);
        expect(syncStops()[0]).toMatchObject({ id: old.id, attributes: { outcome: 'left' } });
        expect(fresh.hasMetric('mount')).toBe(true);
    });
});
