import type * as RuntimeSyncModule from './runtimeSync';

const mockManager = {
    register: jest.fn(() => jest.fn()),
    updateLocalSnapshot: jest.fn(),
    listTargets: jest.fn(() => [{ type: 'chat', id: 'ch-1', cid: 'c-1' }]),
};
const mockSync = {
    refreshBackgroundClouds: jest.fn(),
    subscribeBackgroundDeltas: jest.fn(() => jest.fn()),
    isChannelRefused: jest.fn(() => true),
    subscribeRefusedChannels: jest.fn(() => jest.fn()),
    fetchRoomFeed: jest.fn(async () => ({ fetchedCount: 2 })),
    prefetchRoomFeed: jest.fn(async () => undefined),
};
jest.mock('@chatic/sync', () => ({ getSyncManager: () => mockManager, ...mockSync }));

// Required after the mock: its factory reads `mockManager` above.
const { createCoreRuntimeSync } = require('./runtimeSync') as typeof RuntimeSyncModule;

describe('the core runtime sync', () => {
    beforeEach(() => jest.clearAllMocks());

    it("registers a target for its cloud and hands back the manager's drop", () => {
        const drop = jest.fn();
        mockManager.register.mockReturnValueOnce(drop);

        const stop = createCoreRuntimeSync().registerTarget({ type: 'join', id: 'j-1' } as never, { cid: 'c-1' });

        expect(mockManager.register).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, { cid: 'c-1' });
        expect(stop).toBe(drop);
    });

    it("passes the cache's baseline on, and lists the targets", async () => {
        const sync = createCoreRuntimeSync();

        sync.updateLocalSnapshot({ type: 'chat', id: 'ch-1' } as never, { lastNo: 9 }, { cid: 'c-1' });

        expect(mockManager.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { lastNo: 9 },
            {
                cid: 'c-1',
            }
        );
        await expect(sync.listTargets()).resolves.toEqual([{ type: 'chat', id: 'ch-1', cid: 'c-1' }]);
    });

    it('takes options that crossed the bridge as null for none', () => {
        createCoreRuntimeSync().registerTarget({ type: 'join', id: 'j-1' } as never, null as never);

        expect(mockManager.register).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, undefined);
    });
});

describe('the core runtime sync — rooms, refusals and background clouds', () => {
    beforeEach(() => jest.clearAllMocks());

    it('fetches and prefetches a room, a null option being none', async () => {
        const sync = createCoreRuntimeSync();

        await expect(sync.fetchRoomFeed('c-1', 'ch-1', null as never)).resolves.toEqual({ fetchedCount: 2 });
        await sync.prefetchRoomFeed('c-1', 'ch-1');

        expect(mockSync.fetchRoomFeed).toHaveBeenCalledWith('c-1', 'ch-1', undefined);
        expect(mockSync.prefetchRoomFeed).toHaveBeenCalledWith('c-1', 'ch-1');
    });

    it('kicks the background clouds, and hears their deltas and the refusals', async () => {
        const sync = createCoreRuntimeSync();
        const listener = jest.fn();

        await sync.refreshBackgroundClouds(null as never);
        sync.onBackgroundDelta(listener);
        sync.subscribeRefusedChannels(listener);

        expect(mockSync.refreshBackgroundClouds).toHaveBeenCalledWith(undefined);
        expect(mockSync.subscribeBackgroundDeltas).toHaveBeenCalledWith(listener);
        expect(mockSync.subscribeRefusedChannels).toHaveBeenCalledWith(listener);
        expect(sync.isChannelRefused('ch-1')).toBe(true);
    });
});
