import { coreEngine } from '@chatic/runtime-core/engine';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import {
    clearLocalCaches,
    getAcceptorId,
    getCacheMetricsSource,
    getCloudRepositories,
    recoverInvitedCloudIfMissing,
    requestSyncCursorReset,
    sendChatInCloud,
    setStateOutboxObserver,
    syncInvitedCloudName,
    syncPairedCloudName,
    waitForCloudSocket,
} from './dataCommands';

const stopObserving = jest.fn();
const data = {
    repositories: jest.fn(),
    cloudRepositories: jest.fn(() => ({ chat: {} })),
    sendChatInCloud: jest.fn(async () => ({ id: 'chat-1' })),
    waitForCloudSocket: jest.fn(async () => true),
    recoverInvitedCloud: jest.fn(async () => undefined),
    syncInvitedCloudName: jest.fn(async () => undefined),
    syncPairedCloudName: jest.fn(async () => undefined),
    clearLocalCaches: jest.fn(async () => ({ clouds: [], failures: 0 })),
    requestSyncCursorReset: jest.fn(async () => undefined),
    observeStateOutbox: jest.fn(() => stopObserving),
    cacheMetrics: jest.fn(async () => ({ hits: 1 })),
    resetCacheMetrics: jest.fn(async () => undefined),
    searchCache: jest.fn(),
    resolveCacheContext: jest.fn(),
};
const session = fakeSessionView();

beforeEach(() => {
    jest.clearAllMocks();
    session.set({ relayUser: null, context: emptySessionSnapshot().context });
    initAppRuntime({ ...coreEngine, session, data: data as never });
});

afterEach(() => resetRuntimeEngine());

describe("the data the app reads and writes, through the engine's data", () => {
    it("reads a cloud's graph, sends there and waits for its socket", async () => {
        expect(getCloudRepositories('c-1')).toEqual({ chat: {} });
        await sendChatInCloud('c-1', { content: 'hi' } as never);
        await waitForCloudSocket('c-1', 3000);

        expect(data.cloudRepositories).toHaveBeenCalledWith('c-1');
        expect(data.sendChatInCloud).toHaveBeenCalledWith('c-1', { content: 'hi' });
        expect(data.waitForCloudSocket).toHaveBeenCalledWith('c-1', 3000);
    });

    it('recovers and names clouds by id alone — the engine picks the repository', async () => {
        await recoverInvitedCloudIfMissing('c-1');
        await syncInvitedCloudName('c-1');
        await syncPairedCloudName('c-2');

        expect(data.recoverInvitedCloud).toHaveBeenCalledWith('c-1');
        expect(data.syncInvitedCloudName).toHaveBeenCalledWith('c-1');
        expect(data.syncPairedCloudName).toHaveBeenCalledWith('c-2');
    });

    it('clears the caches and resets the cursors, and reads the cache metrics asynchronously', async () => {
        await clearLocalCaches();
        await requestSyncCursorReset();
        await expect(getCacheMetricsSource().read()).resolves.toEqual({ hits: 1 });
        await getCacheMetricsSource().reset();

        expect(data.requestSyncCursorReset).toHaveBeenCalledTimes(1);
        expect(data.resetCacheMetrics).toHaveBeenCalledTimes(1);
    });

    it('sets one state outbox observer at a time, stopping the last', () => {
        const first = jest.fn();

        setStateOutboxObserver(first);
        setStateOutboxObserver(undefined);

        expect(data.observeStateOutbox).toHaveBeenCalledWith(first);
        expect(stopObserving).toHaveBeenCalledTimes(1);
    });
});

describe('getAcceptorId', () => {
    it("is the relay session's uid", () => {
        session.set({ relayUser: { uid: 'u-1' } });

        expect(getAcceptorId()).toBe('u-1');
    });

    it("falls back to the device guest's delegatorId, and is null while nobody is signed in", () => {
        const context = emptySessionSnapshot().context;
        session.set({ context: { ...context, identity: { ...context.identity, delegatorId: 'guest-1' } } });
        expect(getAcceptorId()).toBe('guest-1');

        session.set({ context });
        expect(getAcceptorId()).toBeNull();
    });
});
