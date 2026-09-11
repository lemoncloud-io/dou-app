import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { UNREGISTER_GRACE_MS } from './constants';
import { SyncManager } from './SyncManager';
import type { ISocketManager, SocketClientListener, SocketKind, SocketSlotClientListener } from '../types';

// Keep the real lib (plan classes, types) but stub createDeviceRuntime so the
// default createRuntime path can be asserted without spinning a real engine.
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return { ...actual, createDeviceRuntime: jest.fn() };
});

// SyncManager → ./plans → data/runtime.ts → DataManager.ts → httpFactory.ts가 `@chatic/http`의
// transport를 값으로 import한다(webTransport). 그 경로가 예전엔 `@chatic/web-config`(import.meta
// 홀더, ts-jest CJS 파싱 불가)로 이어졌지만 이제는 `@chatic/config`(import.meta 0)로 이어져
// 파싱은 더 이상 문제가 아니다 — 그래도 이 테스트가 실제로 쓰지 않는 세션 의존을 끊어 격리하는
// 목은 그대로 둔다.
jest.mock('../../session', () => new Proxy({}, { get: () => jest.fn() }));
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

/**
 * The session uid every construction below is scoped to. Targets are tagged with it at register
 * time and only sync while it still matches, so a test that changes accounts assigns to this.
 */
let mockUid: string | null = 'user-a';
/** Session-change listeners; `promoteTo` mimics an in-place re-auth (guest→social). */
let sessionListeners: Array<() => void> = [];
const subscribeSession = (listener: () => void) => {
    sessionListeners.push(listener);
    return () => {
        sessionListeners = sessionListeners.filter(l => l !== listener);
    };
};
const promoteTo = (uid: string | null) => {
    mockUid = uid;
    sessionListeners.forEach(listener => listener());
};

describe('SyncManager', () => {
    let slotListener: SocketSlotClientListener | null = null;
    let activeListener: SocketClientListener | null = null;
    let manager: jest.Mocked<ISocketManager>;
    let runtimes: Array<jest.Mocked<ClientSocketRuntime>>;
    let runtimeFactory: jest.Mock;

    beforeEach(() => {
        // unregister는 유예 타이머(UNREGISTER_GRACE_MS) 뒤에야 stop한다 — 시간을 손에 쥔다.
        jest.useFakeTimers();
        mockUid = 'user-a';
        sessionListeners = [];
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
        new SyncManager(manager, {
            getUid: () => mockUid,
            subscribeSession,
            buildSyncPlans,
            createRuntime: runtimeFactory,
        });

        bindActiveSlot('relay', makeClient('relay'));
        bindActiveSlot('cloud', makeClient('cloud'));

        expect(buildSyncPlans).toHaveBeenCalledTimes(2);
        expect(runtimeFactory.mock.calls[0][1]).not.toBe(runtimeFactory.mock.calls[1][1]);
    });

    it('does not replay a target onto a client whose boundCid differs (post-swap cleanup, §8-a)', () => {
        (manager.getBoundCid as jest.Mock).mockReturnValue('cloud-A');
        const syncManager = new SyncManager(manager, {
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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

    /**
     * 계정 축(uid) 가드 — 프로덕션 리포트가 이 테스트의 출처다.
     *
     * `403 FORBIDDEN - not allowed to read join @getJoinDetail(U:1000003@1000003)`,
     * 호출자 세션 uid는 1000891, `cid`는 `#`(릴레이). 릴레이는 계정이 바뀌어도 boundCid가
     * 'default'로 그대로라, cid만 보는 가드는 계정 교체를 볼 수 없었다. 1000003 세션이 등록한
     * 자기 셀프챗 조인 타깃이 1000891 세션에서 계속 폴링됐다.
     */
    describe('계정이 바뀌면 이전 세션의 타깃은 따라가지 않는다', () => {
        it('uid가 바뀌면 replay에서 제외된다 — cid가 같아도', () => {
            const syncManager = new SyncManager(manager, {
                getUid: () => mockUid,
                buildSyncPlans: () => [{ domain: 'join' } as DomainSyncPlan],
                createRuntime: runtimeFactory,
            });
            // 릴레이는 계정이 바뀌어도 같은 cid에 머문다 — 사고가 숨어 있던 조건 그 자체.
            (manager.getBoundCid as jest.Mock).mockReturnValue('default');
            bindActiveSlot('relay', makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerJoin('U:1000003@1000003');
            expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });

            // 같은 소켓 위에서 계정만 교체(게스트→소셜 승격, 로그아웃→로그인).
            mockUid = '1000891';
            bindActiveSlot('relay', makeClient('relay-b'));

            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });

        it('uid가 그대로면 replay된다 — 가드가 과하게 막지 않는지', () => {
            const syncManager = new SyncManager(manager, {
                getUid: () => mockUid,
                buildSyncPlans: () => [{ domain: 'join' } as DomainSyncPlan],
                createRuntime: runtimeFactory,
            });
            (manager.getBoundCid as jest.Mock).mockReturnValue('default');
            bindActiveSlot('relay', makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerJoin('U:1000003@1000003');
            bindActiveSlot('relay', makeClient('relay-b'));

            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });
        });

        /**
         * 키에 uid가 없는 도메인(channel/chat/device)이 진짜 함정이다. `channel:1000001`은 누가
         * 로그인해 있든 같은 문자열이라, 재등록이 이전 계정의 엔트리에 합류해버리면 태그가
         * 낡은 채로 남는다.
         */
        it('같은 키를 새 계정이 재등록하면 이전 태그에 합류하지 않는다', () => {
            const syncManager = new SyncManager(manager, {
                getUid: () => mockUid,
                buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
                createRuntime: runtimeFactory,
            });
            (manager.getBoundCid as jest.Mock).mockReturnValue('default');
            bindActiveSlot('relay', makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerChannel('1000001');
            expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);

            mockUid = '1000891';
            syncManager.registerChannel('1000001');

            // 합류했다면 refs만 오르고 startSync는 한 번뿐이다. 새 계정으로 다시 시작해야 맞다.
            expect(runtimes[0].startSync).toHaveBeenCalledTimes(2);
            // 그리고 이전 계정 태그는 남아 있으면 안 된다 — 다음 replay에서 되살아난다.
            bindActiveSlot('relay', makeClient('relay-b'));
            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'channel', id: '1000001' });
        });

        // 세션이 없을 때 등록된 타깃은 와일드카드가 아니다 — cid의 null 규칙과 다른 점.
        it('세션 없이 등록된 타깃은 세션이 붙어도 replay되지 않는다', () => {
            const syncManager = new SyncManager(manager, {
                getUid: () => mockUid,
                buildSyncPlans: () => [{ domain: 'channel' } as DomainSyncPlan],
                createRuntime: runtimeFactory,
            });
            (manager.getBoundCid as jest.Mock).mockReturnValue('default');
            bindActiveSlot('relay', makeClient('relay-a'));

            mockUid = null;
            syncManager.registerChannel('1000001');
            expect(runtimes[0].startSync).not.toHaveBeenCalled();

            mockUid = '1000891';
            bindActiveSlot('relay', makeClient('relay-b'));
            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });
    });

    /**
     * 사용자가 재현해준 시나리오: 게스트 → 소셜 로그인 → 홈 이동.
     *
     * 승격은 같은 소켓을 그대로 두고 신원만 바꾼다(`reauthenticateActiveSocket`). 클라이언트
     * 교체가 없으니 `handleActiveClientChanged`도, replay도 일어나지 않는다 — 이미 돌던 게스트의
     * 타깃이 계속 폴링하며 `join.get {id:"U:<게스트>@<게스트>"}`를 던지고, 서버가 전부 403으로
     * 답한다. 시작을 막는 가드만으로는 이 경로를 못 잡는다.
     */
    it('같은 소켓 위 계정 승격은 이전 계정의 타깃을 즉시 멈춘다', () => {
        const syncManager = new SyncManager(manager, {
            getUid: () => mockUid,
            subscribeSession,
            buildSyncPlans: () => [{ domain: 'join' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        (manager.getBoundCid as jest.Mock).mockReturnValue('default');
        bindActiveSlot('relay', makeClient('relay'));

        mockUid = '1000003';
        syncManager.registerJoin('U:1000003@1000003');
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });

        // 소셜 로그인 — 소켓은 그대로, 신원만 갈린다.
        promoteTo('1000891');

        // 유예를 기다리지 않고 즉시 멈춰야 한다. 조인 플랜 주기가 10초라 30초 유예는
        // 승격 1회당 403 세 번을 더 만든다.
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });
        expect(syncManager.listTargets()).toHaveLength(0);
    });

    it('계정이 그대로인 세션 변화(토큰 갱신 등)는 타깃을 건드리지 않는다', () => {
        const syncManager = new SyncManager(manager, {
            getUid: () => mockUid,
            subscribeSession,
            buildSyncPlans: () => [{ domain: 'join' } as DomainSyncPlan],
            createRuntime: runtimeFactory,
        });
        (manager.getBoundCid as jest.Mock).mockReturnValue('default');
        bindActiveSlot('relay', makeClient('relay'));

        mockUid = '1000003';
        syncManager.registerJoin('U:1000003@1000003');

        promoteTo('1000003');

        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        expect(syncManager.listTargets()).toHaveLength(1);
    });

    it('updateLocalSnapshot을 활성 runtime에 그대로 위임한다', () => {
        const syncManager = new SyncManager(manager, {
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
            getUid: () => mockUid,
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
        new SyncManager(manager, {
            getUid: () => mockUid,
            subscribeSession,
            buildSyncPlans: () => plans,
            runtimeOptions,
        });

        const client = makeClient('relay');
        bindActiveSlot('relay', client);

        expect(mockedCreateDeviceRuntime).toHaveBeenCalledWith({
            client,
            extraSyncPlans: plans,
            ...runtimeOptions,
        });
    });
});
