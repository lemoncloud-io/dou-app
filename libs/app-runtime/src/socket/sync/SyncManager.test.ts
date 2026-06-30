import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { SyncManager } from './SyncManager';
import type { ISocketManager, SocketClientListener } from '../types';

// Keep the real lib (plan classes, types) but stub createDeviceRuntime so the
// default createRuntime path can be asserted without spinning a real engine.
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return { ...actual, createDeviceRuntime: jest.fn() };
});

const mockedCreateDeviceRuntime = createDeviceRuntime as jest.MockedFunction<typeof createDeviceRuntime>;

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

    it('updateLocalSnapshot을 활성 runtime에 그대로 위임한다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        syncManager.updateLocalSnapshot(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
        );

        expect(runtime.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
        );
    });

    it('runtime이 없으면 updateLocalSnapshot은 no-op이다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        // No client emitted → no runtime attached; the pass-through must not throw.
        expect(() =>
            syncManager.updateLocalSnapshot(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 0, minNo: 0, messages: [] }
            )
        ).not.toThrow();
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
