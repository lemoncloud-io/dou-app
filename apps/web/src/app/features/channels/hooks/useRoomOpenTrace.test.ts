import { renderHook } from '@testing-library/react';

import { configurePerfTraces, resetPerfTraces } from '@chatic/perf';

import { ROOM_OPEN_RELEASE_GRACE_MS, roomOpenTrace } from '../../../runtime/perf';
import { ROOM_OPEN_TIMEOUT_MS, useRoomOpenTrace } from './useRoomOpenTrace';

import type { PerfTraceBackend } from '@chatic/perf';
import type { UseRoomOpenTraceParams } from './useRoomOpenTrace';

const backend = { start: jest.fn(), stop: jest.fn() } satisfies PerfTraceBackend;

const loading: UseRoomOpenTraceParams = {
    channelId: 'ch_1',
    isRoomLoading: true,
    isChatLoading: true,
    messageCount: 0,
    atThreadStart: false,
};

const render = (initial: UseRoomOpenTraceParams) =>
    renderHook((props: UseRoomOpenTraceParams) => useRoomOpenTrace(props), { initialProps: initial });

const stopped = () => backend.stop.mock.calls.map(([result]) => result);

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    roomOpenTrace.reset();
    configurePerfTraces(backend);
});

afterEach(() => {
    resetPerfTraces();
    jest.useRealTimers();
});

describe('useRoomOpenTrace', () => {
    it('records nothing for a room no tap began a trace for', () => {
        const { rerender } = render(loading);
        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 3 });

        expect(backend.stop).not.toHaveBeenCalled();
    });

    it('closes the trace as shown once the room stops loading with messages on screen', () => {
        roomOpenTrace.begin('ch_1', 'list');
        const { rerender } = render(loading);

        rerender({ ...loading, isChatLoading: false, messageCount: 5 });
        // The channel half of the skeleton gate is still loading: not shown yet.
        expect(backend.stop).not.toHaveBeenCalled();

        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 5 });

        expect(stopped()).toHaveLength(1);
        expect(stopped()[0]).toMatchObject({
            name: 'chat_room_open',
            attributes: { entry: 'list', cache: 'hit', outcome: 'shown' },
            metrics: expect.objectContaining({
                mount: expect.any(Number),
                cache_emit: expect.any(Number),
                message_count: 5,
            }),
        });
    });

    it('does not end on the empty first emission of a cold cache, and tags it as a miss', () => {
        roomOpenTrace.begin('ch_1', 'list');
        const { rerender } = render(loading);

        // The cache answered with nothing; the page shows an empty room while it fetches.
        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 0 });
        expect(backend.stop).not.toHaveBeenCalled();

        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 20 });

        expect(stopped()[0].attributes).toMatchObject({ cache: 'miss', outcome: 'shown' });
    });

    it('closes the trace as empty when the loaded room holds its first row and nothing to show', () => {
        roomOpenTrace.begin('ch_1', 'list');
        const { rerender } = render(loading);

        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 0, atThreadStart: true });

        expect(stopped()).toHaveLength(1);
        expect(stopped()[0].attributes).toMatchObject({ outcome: 'empty' });
    });

    it('closes the trace as background when the app leaves the foreground before anything shows', () => {
        roomOpenTrace.begin('ch_1', 'list');
        render(loading);

        const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        visibility.mockRestore();
        jest.advanceTimersByTime(ROOM_OPEN_TIMEOUT_MS);

        expect(stopped()).toHaveLength(1);
        expect(stopped()[0].attributes).toMatchObject({ outcome: 'background' });
    });

    it('closes the trace as timeout when nothing shows in time', () => {
        roomOpenTrace.begin('ch_1', 'list');
        render(loading);

        jest.advanceTimersByTime(ROOM_OPEN_TIMEOUT_MS);

        expect(stopped()).toHaveLength(1);
        expect(stopped()[0].attributes).toMatchObject({ outcome: 'timeout' });
    });

    it('closes the trace as left when the room unmounts before showing anything', () => {
        roomOpenTrace.begin('ch_1', 'list');
        const { unmount } = render(loading);

        unmount();
        jest.advanceTimersByTime(ROOM_OPEN_RELEASE_GRACE_MS);

        expect(stopped()).toHaveLength(1);
        expect(stopped()[0].attributes).toMatchObject({ outcome: 'left' });
    });

    it('records one trace, not a second, once it has been shown', () => {
        roomOpenTrace.begin('ch_1', 'list');
        const { rerender, unmount } = render({
            ...loading,
            isRoomLoading: false,
            isChatLoading: false,
            messageCount: 2,
        });

        rerender({ ...loading, isRoomLoading: false, isChatLoading: false, messageCount: 3 });
        unmount();
        jest.advanceTimersByTime(ROOM_OPEN_TIMEOUT_MS);

        expect(stopped()).toHaveLength(1);
    });
});
