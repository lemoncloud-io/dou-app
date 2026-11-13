import { coreEngine } from '@chatic/runtime-core/engine';

import { initAppRuntime, resetRuntimeEngine } from '../../init';
import {
    fetchRoomFeed,
    isChannelRefused,
    listSyncTargets,
    prefetchRoomFeed,
    refreshBackgroundClouds,
    registerSyncTarget,
    subscribeBackgroundDeltas,
    subscribeRefusedChannels,
    updateSyncSnapshot,
} from './syncCommands';

const sync = {
    registerTarget: jest.fn(() => jest.fn()),
    updateLocalSnapshot: jest.fn(),
    listTargets: jest.fn(async () => []),
    refreshBackgroundClouds: jest.fn(async () => undefined),
    onBackgroundDelta: jest.fn(() => jest.fn()),
    isChannelRefused: jest.fn(() => true),
    subscribeRefusedChannels: jest.fn(() => jest.fn()),
    fetchRoomFeed: jest.fn(async () => ({ fetchedCount: 3 })),
    prefetchRoomFeed: jest.fn(async () => undefined),
};

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, sync: sync as never });
});

afterEach(() => resetRuntimeEngine());

describe("the sync the app drives outside React, through the engine's sync", () => {
    it("registers a target for its cloud and hands back the engine's drop", () => {
        const drop = jest.fn();
        sync.registerTarget.mockReturnValueOnce(drop);

        expect(registerSyncTarget({ type: 'join', id: 'j-1' } as never, { cid: 'c-1' })).toBe(drop);
        expect(sync.registerTarget).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, { cid: 'c-1' });
    });

    it("passes the cache's baseline on, and lists the targets", async () => {
        updateSyncSnapshot({ type: 'chat', id: 'ch-1' } as never, { lastNo: 9 }, { cid: 'c-1' });
        await listSyncTargets();

        expect(sync.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { lastNo: 9 },
            { cid: 'c-1' }
        );
        expect(sync.listTargets).toHaveBeenCalledTimes(1);
    });
});

describe("the room feed, refusals and background clouds, through the engine's sync", () => {
    it('fetch and prefetch a room, and kick the background clouds', async () => {
        await expect(fetchRoomFeed('c-1', 'ch-1', { fresh: true })).resolves.toEqual({ fetchedCount: 3 });
        await prefetchRoomFeed('c-1', 'ch-1');
        refreshBackgroundClouds('c-1');

        expect(sync.fetchRoomFeed).toHaveBeenCalledWith('c-1', 'ch-1', { fresh: true });
        expect(sync.prefetchRoomFeed).toHaveBeenCalledWith('c-1', 'ch-1');
        expect(sync.refreshBackgroundClouds).toHaveBeenCalledWith('c-1');
    });

    it('read refusals and hear them and the background deltas', () => {
        const listener = jest.fn();

        expect(isChannelRefused('ch-1')).toBe(true);
        subscribeRefusedChannels(listener);
        subscribeBackgroundDeltas(listener);

        expect(sync.isChannelRefused).toHaveBeenCalledWith('ch-1');
        expect(sync.subscribeRefusedChannels).toHaveBeenCalledWith(listener);
        expect(sync.onBackgroundDelta).toHaveBeenCalledWith(listener);
    });
});
