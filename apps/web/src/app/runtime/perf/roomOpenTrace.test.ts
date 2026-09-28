import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import {
    ROOM_OPEN_CLAIM_TTL_MS,
    ROOM_OPEN_RELEASE_GRACE_MS,
    channelIdOfRoomPath,
    roomOpenTrace,
} from './roomOpenTrace';

import type { PerfTraceBackend } from '@chatic/perf';

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: 1_000_000 });
    roomOpenTrace.reset();
    configurePerfTraces(backend);
});

afterEach(() => {
    resetPerfTraces();
    jest.useRealTimers();
});

describe('channelIdOfRoomPath', () => {
    it('reads the channel id out of a room route, with or without a query', () => {
        expect(channelIdOfRoomPath('/channels/ch_1/room')).toBe('ch_1');
        expect(channelIdOfRoomPath('/channels/ch_1/room?chatId=ch_1:4')).toBe('ch_1');
    });

    it('matches a trailing slash, as the router does — native deep links arrive with one', () => {
        expect(channelIdOfRoomPath('/channels/U:1001750/room/')).toBe('U:1001750');
        expect(channelIdOfRoomPath('/channels/ch_1/room/?cid=c1')).toBe('ch_1');
    });

    it('percent-decodes the id, so it equals the route param the room page reads', () => {
        expect(channelIdOfRoomPath('/channels/U%3A1001750/room')).toBe('U:1001750');
    });

    it('returns null for anything that is not a room', () => {
        expect(channelIdOfRoomPath('/')).toBeNull();
        expect(channelIdOfRoomPath('/channels/ch_1/settings')).toBeNull();
        expect(channelIdOfRoomPath('/channels/ch_1/roomy')).toBeNull();
    });
});

describe('roomOpenTrace', () => {
    it('starts a chat_room_open trace tagged with its entry, for the room page to claim', () => {
        const begun = roomOpenTrace.begin('ch_1', 'list');

        expect(backend.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'chat_room_open' }));
        expect(roomOpenTrace.claim('ch_1')).toBe(begun);

        begun.stop();
        expect(backend.stop.mock.calls[0][0].attributes).toEqual({ entry: 'list' });
    });

    it('adopts a trace the native tap started instead of starting a second one', () => {
        const handedOver = {
            id: 'native-1',
            startedAt: Date.now() - 2_000,
            entry: 'push_tap' as const,
            coldStart: true,
        };

        const trace = roomOpenTrace.begin('ch_1', handedOver.entry, handedOver);
        trace.mark('handler');
        trace.stop();

        expect(backend.start).not.toHaveBeenCalled();
        expect(backend.stop).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'native-1',
                attributes: { entry: 'push_tap', start: 'cold' },
                // Measured from the tap, not from the hand-over.
                metrics: { handler: 2_000 },
            })
        );
    });

    it('hands the trace to its own room only, and only once', () => {
        roomOpenTrace.begin('ch_1', 'list');

        expect(roomOpenTrace.claim('ch_2')).toBeUndefined();
        expect(roomOpenTrace.claim('ch_1')).toBeDefined();
        expect(roomOpenTrace.claim('ch_1')).toBeUndefined();
    });

    it('lets marks be made on the way without taking the trace', () => {
        const begun = roomOpenTrace.begin('ch_1', 'push_banner');

        expect(roomOpenTrace.peek('ch_1')).toBe(begun);
        expect(roomOpenTrace.peek(null)).toBeUndefined();
        expect(roomOpenTrace.claim('ch_1')).toBe(begun);
    });

    it('does not hand over a trace that went stale before its room mounted', () => {
        roomOpenTrace.begin('ch_1', 'list');
        jest.advanceTimersByTime(ROOM_OPEN_CLAIM_TTL_MS + 1);

        expect(roomOpenTrace.claim('ch_1')).toBeUndefined();
    });

    it('closes a released trace as left once the grace window passes', () => {
        const trace = roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.claim('ch_1');
        roomOpenTrace.release('ch_1', trace);

        jest.advanceTimersByTime(ROOM_OPEN_RELEASE_GRACE_MS);

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).toEqual({ entry: 'list', outcome: 'left' });
    });

    it('lets a remount reclaim a released trace, which then is not closed as left', () => {
        const trace = roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.claim('ch_1');
        roomOpenTrace.release('ch_1', trace);

        expect(roomOpenTrace.claim('ch_1')).toBe(trace);
        jest.advanceTimersByTime(ROOM_OPEN_RELEASE_GRACE_MS * 2);

        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('closes a released trace as left when another room is opened inside its grace window', () => {
        const first = roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.claim('ch_1');
        roomOpenTrace.release('ch_1', first);

        roomOpenTrace.begin('ch_2', 'list');

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0]).toMatchObject({ id: first.id, attributes: { outcome: 'left' } });
    });

    it('keeps a newer room waiting when an older, still-loading room unmounts after it began', () => {
        const older = roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.claim('ch_1');
        // A banner tap for another room begins its trace before room 1's page unmounts.
        const newer = roomOpenTrace.begin('ch_2', 'push_banner');
        roomOpenTrace.release('ch_1', older);

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0]).toMatchObject({ id: older.id, attributes: { outcome: 'left' } });
        expect(roomOpenTrace.claim('ch_2')).toBe(newer);
    });

    it('drops an unclaimed trace unrecorded when the app is hidden before its room mounts', () => {
        roomOpenTrace.begin('ch_1', 'list');

        roomOpenTrace.handleHidden();

        expect(backend.stop).not.toHaveBeenCalled();
        expect(roomOpenTrace.claim('ch_1')).toBeUndefined();
    });

    it('closes a released trace as left when the app is hidden inside its grace window', () => {
        const trace = roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.claim('ch_1');
        roomOpenTrace.release('ch_1', trace);

        roomOpenTrace.handleHidden();

        expect(backend.stop).toHaveBeenCalledTimes(1);
        expect(backend.stop.mock.calls[0][0].attributes).toMatchObject({ outcome: 'left' });
    });

    it('drops an unclaimed trace unrecorded when a second tap replaces it', () => {
        roomOpenTrace.begin('ch_1', 'list');
        roomOpenTrace.begin('ch_2', 'list');

        expect(backend.stop).not.toHaveBeenCalled();
        expect(roomOpenTrace.claim('ch_1')).toBeUndefined();
    });
});
