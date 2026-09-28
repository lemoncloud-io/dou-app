/**
 * Per-slot sync, end to end through the real manager and the real plans: a target belongs to one
 * cloud, runs on that cloud's slot runtime whatever is selected or active, and writes only into that
 * cloud's scoped graph.
 *
 * Faked: the socket slots (a slot notification is all the manager subscribes to), the device runtime
 * (it records the plans it was given and the targets it was asked to run), and the data runtime
 * (one spy graph per cloud). Everything between those is the production code.
 */
import type { ClientSocketRuntime, ClientSocketV2, DomainSyncPlan } from '@lemoncloud/chatic-sockets-lib';

import { SyncManager } from './SyncManager';
import type { ISocketManager, SlotKey, SocketSlotClientListener } from '../types';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';

jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));

/** One spy graph per cloud, as `getScopedRepositories(cid)` hands them out. */
const mockGraphs = new Map<string, { channel: { cacheWrite: jest.Mock; cacheDelete: jest.Mock } }>();
const mockUids: Record<string, string> = { default: 'relay-uid', 'cloud-a': 'uid-a', 'cloud-b': 'uid-b' };
jest.mock('../../data/runtime', () => ({
    getDataManager: () => ({
        getScopedRepositories: (cid: string) => {
            if (!mockGraphs.has(cid)) {
                mockGraphs.set(cid, { channel: { cacheWrite: jest.fn(), cacheDelete: jest.fn() } });
            }
            return mockGraphs.get(cid);
        },
        getScopedContext: (cid: string) => ({ cid, uid: mockUids[cid], socketCid: cid }),
    }),
}));

const CLOUD_A = slotKeyOf('cloud-a');
const CLOUD_B = slotKeyOf('cloud-b');

interface FakeRuntime {
    runtime: jest.Mocked<ClientSocketRuntime>;
    plans: DomainSyncPlan[];
}

const channelOnUpdate = (plans: DomainSyncPlan[]) =>
    (
        plans.find(plan => plan.domain === 'channel') as unknown as {
            options: { onUpdate: (...args: unknown[]) => void };
        }
    ).options.onUpdate;

describe('per-slot sync — a target stays with the cloud it belongs to', () => {
    let slotListener: SocketSlotClientListener;
    let runtimes: Map<SlotKey, FakeRuntime[]>;
    let selected: string;
    let syncManager: SyncManager;

    const bind = (key: SlotKey, tag: string) => slotListener(key, { tag } as unknown as ClientSocketV2);
    const latest = (key: SlotKey): FakeRuntime => {
        const list = runtimes.get(key) ?? [];
        return list[list.length - 1];
    };

    beforeEach(() => {
        jest.useFakeTimers();
        mockGraphs.clear();
        runtimes = new Map();
        selected = 'cloud-b';
        const manager = {
            subscribeSlotClients: jest.fn((listener: SocketSlotClientListener) => {
                slotListener = listener;
                return () => undefined;
            }),
        } as unknown as ISocketManager;
        let bindingSlot: SlotKey | null = null;
        syncManager = new SyncManager(manager, {
            getUid: cid => mockUids[cid] ?? null,
            getSessionUid: () => mockUids[selected] ?? null,
            getCid: () => selected,
            subscribeSession: () => () => undefined,
            // The real plans, built for the slot the runtime is being created for.
            buildSyncPlans: slot => {
                bindingSlot = slot;
                return jest.requireActual('./plans').createSyncPlans(slot);
            },
            createRuntime: (_client, plans) => {
                const runtime = {
                    start: jest.fn(),
                    stop: jest.fn(),
                    startSync: jest.fn(),
                    stopSync: jest.fn(),
                    stopAllSync: jest.fn(),
                    listSyncTargets: jest.fn(),
                    updateLocalSnapshot: jest.fn(),
                } as unknown as jest.Mocked<ClientSocketRuntime>;
                const key = bindingSlot as SlotKey;
                runtimes.set(key, [...(runtimes.get(key) ?? []), { runtime, plans }]);
                return runtime;
            },
        });
    });

    afterEach(() => {
        syncManager.destroy();
        jest.useRealTimers();
    });

    it('runs a cloud-A target on A while B is selected, and writes its frames into A only', () => {
        bind(RELAY_SLOT, 'relay');
        bind(CLOUD_B, 'cloud-b');
        bind(CLOUD_A, 'cloud-a');

        syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-a' });

        expect(latest(CLOUD_A).runtime.startSync).toHaveBeenCalledWith({ type: 'channel', id: '1000001' });
        expect(latest(CLOUD_B).runtime.startSync).not.toHaveBeenCalled();
        expect(latest(RELAY_SLOT).runtime.startSync).not.toHaveBeenCalled();

        // A frame from A's scheduler lands in A's partition, stamped with A.
        channelOnUpdate(latest(CLOUD_A).plans)({ type: 'channel', id: '1000001' }, { id: '1000001', name: 'a room' });

        expect(mockGraphs.get('cloud-a')?.channel.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ id: '1000001', cid: 'cloud-a' })
        );
        expect(mockGraphs.has('cloud-b')).toBe(false);
    });

    it("keeps it on A across a switch to B and back — B's slot coming and going moves nothing", () => {
        bind(RELAY_SLOT, 'relay');
        bind(CLOUD_A, 'cloud-a');
        syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-a' });
        const aRuntime = latest(CLOUD_A).runtime;

        // Switch to B: its slot binds, the selection follows. Then back: B goes, A is selected again.
        bind(CLOUD_B, 'cloud-b');
        selected = 'cloud-b';
        slotListener(CLOUD_B, null);
        selected = 'cloud-a';

        expect(aRuntime.startSync).toHaveBeenCalledTimes(1);
        expect(aRuntime.stopSync).not.toHaveBeenCalled();
        expect(aRuntime.stopAllSync).not.toHaveBeenCalled();
        expect(latest(CLOUD_B).runtime.startSync).not.toHaveBeenCalled();
    });

    it('waits for A when A is not bound yet, then starts on the first slot A gets', () => {
        bind(RELAY_SLOT, 'relay');
        bind(CLOUD_B, 'cloud-b');

        syncManager.register({ type: 'place', id: '10014' }, { cid: 'cloud-a' });
        expect(latest(CLOUD_B).runtime.startSync).not.toHaveBeenCalled();

        bind(CLOUD_A, 'cloud-a');
        expect(latest(CLOUD_A).runtime.startSync).toHaveBeenCalledWith({ type: 'place', id: '10014' });
    });

    // Ids are only unique inside a cloud: A's and B's channel 1000001 are two different rooms.
    it("gives A's and B's same-id channel their own targets, each writing its own partition", () => {
        bind(CLOUD_A, 'cloud-a');
        bind(CLOUD_B, 'cloud-b');

        syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-a' });
        syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-b' });

        channelOnUpdate(latest(CLOUD_B).plans)({ type: 'channel', id: '1000001' }, { id: '1000001', name: 'b room' });

        expect(latest(CLOUD_A).runtime.startSync).toHaveBeenCalledTimes(1);
        expect(latest(CLOUD_B).runtime.startSync).toHaveBeenCalledTimes(1);
        expect(mockGraphs.get('cloud-b')?.channel.cacheWrite).toHaveBeenCalledWith(
            expect.objectContaining({ cid: 'cloud-b' })
        );
        expect(mockGraphs.has('cloud-a')).toBe(false);
    });
});
