import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { SyncManager, UNREGISTER_GRACE_MS } from './SyncManager';
import type { ISocketManager, SocketClientListener, SocketKind, SocketSlotClientListener } from '../types';

// Keep the real lib (plan classes, types) but stub createDeviceRuntime so the
// default createRuntime path can be asserted without spinning a real engine.
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return { ...actual, createDeviceRuntime: jest.fn() };
});

// SyncManager → ./plans → data/runtime.ts → DataManager.ts → httpFactory.ts가 `@chatic/web-core`를
// 값으로 import한다(webTransport). 그 모듈은 `import.meta.env`를 로드 시점에 읽어 ts-jest(CJS)가
// 파싱하지 못하므로, 이 테스트가 실제로 쓰지 않는 의존이어도 목으로 끊어야 한다.
jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
// `@chatic/web-config` is the sole `import.meta` holder (ADR-0070 결정 6); ts-jest's CommonJS
// transform cannot parse it, and HttpManager pulls it in transitively.
jest.mock('@chatic/web-config', () => new Proxy({}, { get: () => jest.fn() }));

const mockedCreateDeviceRuntime = createDeviceRuntime as jest.MockedFunction<typeof createDeviceRuntime>;

const makeRuntime = (): jest.Mocked<ClientSocketRuntime> =>
    ({
        start: jest.fn(),
        stop: jest.fn(),
        startSync: jest.fn(),
        stopSync: jest.fn(),
        stopAllSync: jest.fn(),
        listSyncTargets: jest.fn(),
        updateLocalSnapshot: jest.fn(),
    }) as unknown as jest.Mocked<ClientSocketRuntime>;

const makeClient = (tag: string): ClientSocketV2 => ({ state: 'idle', tag }) as unknown as ClientSocketV2;

describe('SyncManager', () => {
    let slotListener: SocketSlotClientListener | null = null;
    let activeListener: SocketClientListener | null = null;
    let manager: jest.Mocked<ISocketManager>;
    let runtimes: Array<jest.Mocked<ClientSocketRuntime>>;
    let runtimeFactory: jest.Mock;

    beforeEach(() => {
        // unregister는 유예 타이머(UNREGISTER_GRACE_MS) 뒤에야 stop한다 — 시간을 손에 쥔다.
        jest.useFakeTimers();
        slotListener = null;
        activeListener = null;
        manager = {
            ensure: jest.fn(),
            getClient: jest.fn(),
            getSnapshot: jest.fn(),
            subscribe: jest.fn(),
            subscribeClient: jest.fn().mockImplementation(next => {
                activeListener = next;
                next(null);
                return jest.fn();
            }),
            subscribeSlotClients: jest.fn().mockImplementation(next => {
                slotListener = next;
                return jest.fn();
            }),
            getBoundCid: jest.fn().mockReturnValue(null),
            markUnverified: jest.fn(),
            connect: jest.fn(),
            destroy: jest.fn(),
        } as unknown as jest.Mocked<ISocketManager>;

        // A fresh runtime per createRuntime call so per-slot runtimes are distinguishable.
        runtimes = [];
        runtimeFactory = jest.fn().mockImplementation(() => {
            const runtime = makeRuntime();
            runtimes.push(runtime);
            return runtime;
        });
        mockedCreateDeviceRuntime.mockReset().mockImplementation((() => {
            const runtime = makeRuntime();
            runtimes.push(runtime);
            return runtime;
        }) as unknown as typeof createDeviceRuntime);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // Mirrors the SocketManager notification order for one slot mutation: slot first, active second.
    const bindActiveSlot = (kind: SocketKind, client: ClientSocketV2) => {
        slotListener?.(kind, client);
        activeListener?.(client);
    };

    it('replays registered targets onto the runtime once its slot binds and becomes active', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        expect(runtimes).toHaveLength(0);

        bindActiveSlot('relay', makeClient('relay'));

        expect(runtimeFactory).toHaveBeenCalledTimes(1);
        // start() activates the device runtime's connect-driven save + slot controllers.
        expect(runtimes[0].start).toHaveBeenCalledTimes(1);
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        dispose();

        // dispose는 즉시 stop하지 않는다 — 화면 전환의 재등록 창을 위한 유예(ADR-0058).
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('유예 내 재등록은 stop도 재시작도 만들지 않는다 — 살아 있는 타깃에 합류한다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS / 2);

        // 방↔홈 왕복: 다음 화면이 같은 타깃을 다시 등록한다.
        syncManager.register({ type: 'channel', id: 'ch-1' });
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS * 2);

        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        // 재등록은 merge 경로라 startSync는 최초 1회뿐 — 즉시 재폴링이 없다는 뜻이다.
        expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);
    });

    it('활성 클라이언트 교체는 유예 엔트리를 버린다 — 재등록이 새 클라이언트에서 다시 시작되게', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose(); // 유예 진입

        // 유예 중 클라우드로 전환: refs 0 엔트리는 replay되지 않아야 한다.
        bindActiveSlot('cloud', makeClient('cloud'));
        const cloudRuntime = runtimes[1];
        expect(cloudRuntime.startSync).not.toHaveBeenCalled();

        // purge되지 않았다면 이 재등록은 merge 경로로 빠져 startSync가 영영 없다 — 그 회귀를 잡는다.
        syncManager.register({ type: 'channel', id: 'ch-1' });
        expect(cloudRuntime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        // 버려진 유예 타이머가 뒤늦게 새 클라이언트의 타깃을 내리지 않는다.
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(cloudRuntime.stopSync).not.toHaveBeenCalled();
    });

    it('destroy()는 유예 타이머를 정리한다 — 파괴 후 지연 stop이 날아오지 않는다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose();
        syncManager.destroy();

        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
    });

    it('keeps the relay runtime running when a cloud becomes active (device.save/keepAlive per slot)', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        const relayClient = makeClient('relay');
        const cloudClient = makeClient('cloud');

        bindActiveSlot('relay', relayClient);
        syncManager.register({ type: 'channel', id: 'ch-1' });
        const relayRuntime = runtimes[0];
        expect(relayRuntime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        // A cloud slot binds and becomes active. The relay runtime must survive — stopping it would
        // kill the relay's connect-driven device.save + keepAlive, leaving a later relay reconnect
        // device-less (the "400 no device linked" push-mute bug). Only its TARGETS move off.
        bindActiveSlot('cloud', cloudClient);

        expect(runtimes).toHaveLength(2);
        const cloudRuntime = runtimes[1];
        expect(relayRuntime.stop).not.toHaveBeenCalled();
        expect(relayRuntime.stopAllSync).toHaveBeenCalledTimes(1);
        expect(cloudRuntime.start).toHaveBeenCalledTimes(1);
        // cid-agnostic target (registered under boundCid null) replays onto the cloud runtime.
        expect(cloudRuntime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('detaches a slot runtime when that slot is torn down (slot → null)', () => {
        new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        const relayClient = makeClient('relay');
        const cloudClient = makeClient('cloud');
        bindActiveSlot('relay', relayClient);
        bindActiveSlot('cloud', cloudClient);
        const [relayRuntime, cloudRuntime] = runtimes;

        // Cloud logout: the slot notification (null) precedes the active fallback to relay.
        slotListener?.('cloud', null);
        activeListener?.(relayClient);

        expect(cloudRuntime.stopAllSync).toHaveBeenCalled();
        expect(cloudRuntime.stop).toHaveBeenCalledTimes(1);
        expect(relayRuntime.stop).not.toHaveBeenCalled();
    });

    it('rebuilding a backgrounded slot replaces only that slot runtime (relay rebuilt under cloud)', () => {
        new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));
        bindActiveSlot('cloud', makeClient('cloud'));
        const [relayRuntime, cloudRuntime] = runtimes;

        // Relay slot rebuilds (e.g. token identity change) while cloud stays active: the manager
        // notifies (relay, null) then (relay, newClient) — no active change follows.
        slotListener?.('relay', null);
        slotListener?.('relay', makeClient('relay-2'));

        expect(relayRuntime.stop).toHaveBeenCalledTimes(1);
        expect(runtimes).toHaveLength(3);
        expect(runtimes[2].start).toHaveBeenCalledTimes(1);
        // The active (cloud) runtime is untouched.
        expect(cloudRuntime.stopAllSync).not.toHaveBeenCalled();
        expect(cloudRuntime.stop).not.toHaveBeenCalled();
    });

    it('builds sync plans per runtime so concurrent slot schedulers never share plan instances', () => {
        const buildSyncPlans = jest.fn(() => [{ domain: 'channel' } as DomainSyncPlan]);
        new SyncManager(manager, { buildSyncPlans, createRuntime: runtimeFactory });

        bindActiveSlot('relay', makeClient('relay'));
        bindActiveSlot('cloud', makeClient('cloud'));

        expect(buildSyncPlans).toHaveBeenCalledTimes(2);
        expect(runtimeFactory.mock.calls[0][1]).not.toBe(runtimeFactory.mock.calls[1][1]);
    });

    it('does not replay a target onto a client whose boundCid differs (post-swap cleanup, §8-a)', () => {
        (manager.getBoundCid as jest.Mock).mockReturnValue('cloud-A');
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });

        // Registered while cloud-A is active → tagged cloud-A; starts once cloud-A's client attaches.
        syncManager.register({ type: 'channel', id: 'ch-1' });
        bindActiveSlot('cloud', makeClient('cloud-A'));
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        // Cloud logout → relay becomes the active client (boundCid 'default'). The cloud-A channel
        // target must NOT be replayed onto the relay socket.
        (manager.getBoundCid as jest.Mock).mockReturnValue('default');
        slotListener?.('cloud', null);
        bindActiveSlot('relay', makeClient('relay'));
        expect(runtimes[1].startSync).not.toHaveBeenCalled();

        // Switching back to cloud-A re-activates it.
        (manager.getBoundCid as jest.Mock).mockReturnValue('cloud-A');
        bindActiveSlot('cloud', makeClient('cloud-A-again'));
        expect(runtimes[2].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('registers a chat target and stops it on dispose', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        const dispose = syncManager.registerChat('ch-1');
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        dispose();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });
    });

    it('updateLocalSnapshot을 활성 runtime에 그대로 위임한다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'chat' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        syncManager.updateLocalSnapshot(
            { type: 'chat', id: 'ch-1' },
            { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
        );

        expect(runtimes[0].updateLocalSnapshot).toHaveBeenCalledWith(
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
        expect(runtimes).toHaveLength(0);
    });

    it('reference-counts duplicate registrations before stopping a target', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'place' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));

        const target: SyncTargetDescriptor = { type: 'place', id: 'site-1' };
        const disposeA = syncManager.register(target);
        const disposeB = syncManager.register(target);

        expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);

        disposeA();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();

        disposeB();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).toHaveBeenCalledTimes(1);
        expect(runtimes[0].stopSync).toHaveBeenCalledWith(target);
    });

    it('destroy()는 모든 슬롯 runtime을 내리고 구독을 해제한다', () => {
        const syncManager = new SyncManager(manager, {
            buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        bindActiveSlot('relay', makeClient('relay'));
        bindActiveSlot('cloud', makeClient('cloud'));

        syncManager.destroy();

        expect(runtimes[0].stop).toHaveBeenCalledTimes(1);
        expect(runtimes[1].stop).toHaveBeenCalledTimes(1);
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

        const client = makeClient('relay');
        bindActiveSlot('relay', client);

        expect(mockedCreateDeviceRuntime).toHaveBeenCalledWith({
            client,
            extraSyncPlans: plans,
            ...runtimeOptions,
        });
    });
});
