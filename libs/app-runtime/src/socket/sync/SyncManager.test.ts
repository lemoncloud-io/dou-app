import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { SyncManager } from './SyncManager';
import type { ISocketManager, SocketClientListener } from '../types';

const mockRefreshList = jest.fn().mockResolvedValue(undefined);
const mockCacheReadList = jest.fn().mockResolvedValue({ list: [] });
jest.mock('../../data/runtime', () => ({
    getRepositories: () => ({ chat: { refreshList: mockRefreshList, cacheReadList: mockCacheReadList } }),
}));

// Keep the real lib (plan classes, types) but stub createDeviceRuntime so the
// default createRuntime path can be asserted without spinning a real engine.
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return { ...actual, createDeviceRuntime: jest.fn() };
});

const mockedCreateDeviceRuntime = createDeviceRuntime as jest.MockedFunction<typeof createDeviceRuntime>;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SyncManager', () => {
    let listener: SocketClientListener | null = null;
    let manager: jest.Mocked<ISocketManager>;
    let runtime: jest.Mocked<ClientSocketRuntime>;
    let runtimeFactory: jest.Mock;

    beforeEach(() => {
        manager = {
            ensure: jest.fn(),
            getClient: jest.fn(),
            getSnapshot: jest.fn(),
            subscribe: jest.fn(),
            subscribeClient: jest.fn().mockImplementation(next => {
                listener = next;
                next(null);
                return jest.fn();
            }),
            markUnverified: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        } as unknown as jest.Mocked<ISocketManager>;

        runtime = {
            start: jest.fn(),
            stop: jest.fn(),
            startSync: jest.fn(),
            stopSync: jest.fn(),
            stopAllSync: jest.fn(),
            listSyncTargets: jest.fn(),
            updateLocalSnapshot: jest.fn(),
        } as unknown as jest.Mocked<ClientSocketRuntime>;

        runtimeFactory = jest.fn().mockReturnValue(runtime);
        mockRefreshList.mockClear();
        mockCacheReadList.mockClear().mockResolvedValue({ list: [] });
        mockedCreateDeviceRuntime.mockReset().mockReturnValue(runtime as any);
    });

    it('replays registered targets onto a replacement runtime', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        expect(runtime.startSync).not.toHaveBeenCalled();

        listener?.({ state: 'idle' } as ClientSocketV2);

        expect(runtimeFactory).toHaveBeenCalledTimes(1);
        // start() activates the device runtime's connect-driven save + rotation.
        expect(runtime.start).toHaveBeenCalledTimes(1);
        expect(runtime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        dispose();

        expect(runtime.stopSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('registers a chat target and stops it on dispose', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        const dispose = syncManager.registerChat('ch-1');
        expect(runtime.startSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        dispose();
        expect(runtime.stopSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });
    });

    it('sets the chat plan baseline from cache max chatNo and fetches a first page only when empty', async () => {
        mockCacheReadList.mockResolvedValue({ list: [] });
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        syncManager.registerChat('ch-1');
        await flush();

        // empty cache → baseline lastNo 0 + first-page fetch
        expect(runtime.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 0, minNo: 0, messages: [] }
        );
        expect(mockRefreshList).toHaveBeenCalledWith({ channelId: 'ch-1' });
    });

    it('aligns the baseline to cached chatNo without refetching when the cache is warm', async () => {
        mockCacheReadList.mockResolvedValue({ list: [{ chatNo: 5 }, { chatNo: 9 }, { chatNo: 7 }] });
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        syncManager.registerChat('ch-1');
        await flush();

        expect(runtime.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
        );
        expect(mockRefreshList).not.toHaveBeenCalled();
    });

    it('does not prime non-chat targets', async () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        syncManager.registerChannel('ch-1');
        await flush();

        expect(mockCacheReadList).not.toHaveBeenCalled();
        expect(mockRefreshList).not.toHaveBeenCalled();
        expect(runtime.updateLocalSnapshot).not.toHaveBeenCalled();
    });

    it('reference-counts duplicate registrations before stopping a target', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'place' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        const target: SyncTargetDescriptor = { type: 'place', id: 'site-1' };
        const disposeA = syncManager.register(target);
        const disposeB = syncManager.register(target);

        expect(runtime.startSync).toHaveBeenCalledTimes(1);

        disposeA();
        expect(runtime.stopSync).not.toHaveBeenCalled();

        disposeB();
        expect(runtime.stopSync).toHaveBeenCalledTimes(1);
        expect(runtime.stopSync).toHaveBeenCalledWith(target);
    });

    it('forwards injected runtimeOptions to createDeviceRuntime (default factory)', () => {
        const plans = [{ domain: 'channel' } as DomainSyncPlan];
        const runtimeOptions = {
            keepAliveOptions: { intervalMs: 30000, timeoutMs: 5000 },
            reconnectOptions: { minDelayMs: 500, maxDelayMs: 10000 },
            rotationOptions: { maxLifetimeMs: 6600000, refreshBeforeMs: 600000 },
            devicePlanOptions: { intervalMs: 2000, sendSyncHint: false },
        };

        // No createRuntime override → exercises the default createDeviceRuntime path.
        new SyncManager(manager, { buildSyncPlans: () => plans, runtimeOptions });

        const client = { state: 'idle' } as ClientSocketV2;
        listener?.(client);

        expect(mockedCreateDeviceRuntime).toHaveBeenCalledWith({
            client,
            extraSyncPlans: plans,
            ...runtimeOptions,
        });
    });
});
