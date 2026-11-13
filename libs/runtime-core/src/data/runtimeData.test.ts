import type * as RuntimeDataModule from './runtimeData';

const mockGraph = { cloud: { id: 'cloud-repo' } };
const mockCloudGraph = { cloud: { id: 'other-cloud-repo' } };
const mockContext = { uid: 'u-1' as string | null };
jest.mock('./runtime', () => ({
    getRepositories: () => mockGraph,
    getDataManager: () => ({ getContext: () => mockContext }),
}));
const mockCloudChat = {
    getCloudRepositories: jest.fn(() => mockCloudGraph),
    sendChatInCloud: jest.fn(async () => ({ id: 'chat-1' })),
    waitForCloudSocket: jest.fn(async () => true),
};
jest.mock('./cloudChat', () => mockCloudChat);
const mockDurability = {
    recoverInvitedCloudIfMissing: jest.fn(async () => undefined),
    syncInvitedCloudName: jest.fn(),
};
jest.mock('./invitedCloudDurability', () => mockDurability);
const mockSyncPairedCloudName = jest.fn(async () => undefined);
jest.mock('./pairedCloudName', () => ({
    syncPairedCloudName: (...args: unknown[]) => mockSyncPairedCloudName(...(args as [])),
}));
const mockClear = jest.fn(async () => ({ clouds: ['default'], failures: 0 }));
jest.mock('./clearLocalCaches', () => ({ clearLocalCaches: () => mockClear() }));
const mockCursorReset = jest.fn();
jest.mock('./syncCursorWatermark', () => ({ requestSyncCursorReset: () => mockCursorReset() }));
const mockSetObserver = jest.fn();
jest.mock('./factories/outboxFactory', () => ({ setStateOutboxObserver: (o: unknown) => mockSetObserver(o) }));
const mockMetrics = { read: jest.fn(() => ({ hits: 3 })), reset: jest.fn() };
const mockSearch = { search: jest.fn(async () => ({ channels: ['x'] })), resolveContext: jest.fn(async () => ({})) };
jest.mock('./factories/localFactory', () => ({
    getCacheMetricsSource: () => mockMetrics,
    getGlobalCacheSearchSource: () => mockSearch,
}));
jest.mock('./pageRepositories', () => ({ pageRepositoriesOf: (graph: unknown) => ({ page: graph }) }));

// Required after the mocks: their factories read the `mock*` values above.
const { createCoreRuntimeData } = require('./runtimeData') as typeof RuntimeDataModule;

beforeEach(() => {
    jest.clearAllMocks();
    mockContext.uid = 'u-1';
});

describe('the core runtime data', () => {
    const data = createCoreRuntimeData();

    it("hands over the page's view of the live scope's graph and of a named cloud's", () => {
        expect(data.repositories()).toEqual({ page: mockGraph });
        expect(data.cloudRepositories('c-1')).toEqual({ page: mockCloudGraph });
        expect(mockCloudChat.getCloudRepositories).toHaveBeenCalledWith('c-1');
    });

    it("sends in a named cloud and waits for its socket, a null wait being the default's", async () => {
        await data.sendChatInCloud('c-1', { content: 'hi' } as never);
        await data.waitForCloudSocket('c-1', null as never);

        expect(mockCloudChat.sendChatInCloud).toHaveBeenCalledWith('c-1', { content: 'hi' });
        expect(mockCloudChat.waitForCloudSocket).toHaveBeenCalledWith('c-1', undefined);
    });

    it("runs the cloud name and recovery work on the live scope's cloud repository", async () => {
        await data.recoverInvitedCloud('c-1');
        await data.syncInvitedCloudName('c-1');
        await data.syncPairedCloudName(null as never);

        expect(mockDurability.recoverInvitedCloudIfMissing).toHaveBeenCalledWith(mockGraph.cloud, 'c-1');
        expect(mockDurability.syncInvitedCloudName).toHaveBeenCalledWith(mockGraph.cloud, 'c-1');
        expect(mockSyncPairedCloudName).toHaveBeenCalledWith(mockGraph.cloud, undefined);
    });

    it('clears the caches, resets the cursors, and reads and resets the metrics', async () => {
        await expect(data.clearLocalCaches()).resolves.toEqual({ clouds: ['default'], failures: 0 });
        await data.requestSyncCursorReset();
        await expect(data.cacheMetrics()).resolves.toEqual({ hits: 3 });
        await data.resetCacheMetrics();

        expect(mockCursorReset).toHaveBeenCalledTimes(1);
        expect(mockMetrics.reset).toHaveBeenCalledTimes(1);
    });

    it('searches the cache as the signed-in account, and answers empty while signed out', async () => {
        await expect(data.searchCache('hello', { cid: 'c-1' })).resolves.toEqual({ channels: ['x'] });
        expect(mockSearch.search).toHaveBeenCalledWith('hello', { uid: 'u-1', cid: 'c-1' });

        mockContext.uid = null;
        await expect(data.searchCache('hello')).resolves.toEqual({ channels: [], sites: [], chats: [] });
        await expect(data.resolveCacheContext({ cids: [], channelRefs: [] })).resolves.toEqual({
            channelsByRef: {},
            sitesByRef: {},
            joinsByRef: {},
            lastChatsByRef: {},
        });
        expect(mockSearch.resolveContext).not.toHaveBeenCalled();
    });

    it('keeps a newer state outbox observer when an older one is stopped', () => {
        const first = jest.fn();
        const second = jest.fn();

        const stopFirst = data.observeStateOutbox(first);
        const stopSecond = data.observeStateOutbox(second);
        stopFirst();

        expect(mockSetObserver.mock.calls).toEqual([[first], [second]]);
        stopSecond();
        expect(mockSetObserver).toHaveBeenLastCalledWith(undefined);
    });
});
