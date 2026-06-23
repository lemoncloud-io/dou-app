import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

import { AppSyncRuntime } from './AppSyncRuntime';
import type { ISocketManager, SocketClientListener } from '../types';

describe('AppSyncRuntime', () => {
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
    });

    it('replays registered targets onto a replacement runtime', () => {
        const appSyncRuntime = new AppSyncRuntime(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });

        const dispose = appSyncRuntime.register({ type: 'channel', id: 'ch-1' });
        expect(runtime.startSync).not.toHaveBeenCalled();

        listener?.({ state: 'idle' } as ClientSocketV2);

        expect(runtimeFactory).toHaveBeenCalledTimes(1);
        expect(runtime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        dispose();

        expect(runtime.stopSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('reference-counts duplicate registrations before stopping a target', () => {
        const appSyncRuntime = new AppSyncRuntime(manager, {
            buildSyncPlans: () => [{ domain: 'place' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        listener?.({ state: 'idle' } as ClientSocketV2);

        const target: SyncTargetDescriptor = { type: 'place', id: 'site-1' };
        const disposeA = appSyncRuntime.register(target);
        const disposeB = appSyncRuntime.register(target);

        expect(runtime.startSync).toHaveBeenCalledTimes(1);

        disposeA();
        expect(runtime.stopSync).not.toHaveBeenCalled();

        disposeB();
        expect(runtime.stopSync).toHaveBeenCalledTimes(1);
        expect(runtime.stopSync).toHaveBeenCalledWith(target);
    });
});
