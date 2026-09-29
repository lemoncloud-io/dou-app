import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { UNREGISTER_GRACE_MS } from './constants';
import { SyncManager } from './SyncManager';
import { clearRefusedChannels, isChannelRefused, recordRefusedChannel } from './refusedChannels';
import type { SyncManagerDeps } from './types';
import type { ISocketManager, SlotKey, SocketSlotClientListener } from '../types';
import { RELAY_SLOT, slotKeyOf } from '../utils/slotKey';

/** Slots are keyed by the cloud they serve; these are the relay's and two fixture clouds'. */
const RELAY = RELAY_SLOT;
const CLOUD_A = slotKeyOf('cloud-a');
const CLOUD_B = slotKeyOf('cloud-b');

// Keep the real lib (plan classes, types) but stub createDeviceRuntime so the
// default createRuntime path can be asserted without spinning a real engine.
jest.mock('@lemoncloud/chatic-sockets-lib', () => {
    const actual = jest.requireActual('@lemoncloud/chatic-sockets-lib');
    return { ...actual, createDeviceRuntime: jest.fn() };
});

// SyncManager → ./plans → data/runtime.ts → DataManager.ts → httpFactory.ts imports `@chatic/http`'s
// transport as a value (webTransport). That chain used to lead to `@chatic/web-config` (an
// import.meta holder that ts-jest's CJS parser can't handle), but now leads to `@chatic/config`
// (import.meta count 0), so parsing is no longer the problem — this mock is kept anyway, to cut and
// isolate the session dependency this test doesn't actually use.
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
 * The uid this account has in each cloud. Targets are tagged with their cloud's at register time and
 * only sync while it still matches, so a test that changes accounts assigns here. A cloud with no
 * entry answers with `mockUid`, which is what most tests (one account, any cloud) want.
 */
let mockUid: string | null = 'user-a';
let mockUids: Record<string, string | null> = {};
const uidIn = (cid: string): string | null => (cid in mockUids ? mockUids[cid] : mockUid);
/**
 * The session's own uid: what a target registered without a cloud is tagged with, and what refusals
 * are cleared on. It follows `mockUid` unless a test sets it — which is how a switch window, where
 * the session still has the outgoing cloud's uid, is staged.
 */
let mockSessionUid: string | null | undefined;
const sessionUid = (): string | null => (mockSessionUid === undefined ? mockUid : mockSessionUid);
/** The selected cloud a target defaults to. */
let mockCid = 'default';
/** Session-change listeners; `promoteTo` mimics an in-place re-auth (guest→social). */
let sessionListeners: Array<() => void> = [];
const subscribeSession = (listener: () => void) => {
    sessionListeners.push(listener);
    return () => {
        sessionListeners = sessionListeners.filter(l => l !== listener);
    };
};
const emitSession = () => sessionListeners.forEach(listener => listener());
const promoteTo = (uid: string | null) => {
    mockUid = uid;
    emitSession();
};

describe('SyncManager', () => {
    let slotListener: SocketSlotClientListener | null = null;
    let manager: jest.Mocked<ISocketManager>;
    let runtimes: Array<jest.Mocked<ClientSocketRuntime>>;
    let runtimeFactory: jest.Mock;

    beforeEach(() => {
        // unregister only stops after the grace timer (UNREGISTER_GRACE_MS) — take control of time.
        jest.useFakeTimers();
        mockUid = 'user-a';
        mockUids = {};
        mockSessionUid = undefined;
        mockCid = 'default';
        sessionListeners = [];
        slotListener = null;
        clearRefusedChannels();
        manager = {
            ensure: jest.fn(),
            getClient: jest.fn(),
            getSnapshot: jest.fn(),
            subscribe: jest.fn(),
            subscribeClient: jest.fn(),
            subscribeSlotClients: jest.fn().mockImplementation(next => {
                slotListener = next;
                return jest.fn();
            }),
            getBoundCid: jest.fn().mockReturnValue(null),
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

    const createManager = (domain: string, overrides: SyncManagerDeps = {}) =>
        new SyncManager(manager, {
            getUid: uidIn,
            getSessionUid: sessionUid,
            getCid: () => mockCid,
            subscribeSession,
            buildSyncPlans: () => [{ domain } as DomainSyncPlan],
            createRuntime: runtimeFactory,
            ...overrides,
        });

    /** What SocketManager notifies when one slot binds or rebuilds (`client`) or is torn down (`null`). */
    const bindSlot = (key: SlotKey, client: ClientSocketV2 | null) => {
        slotListener?.(key, client);
    };

    it('starts a registered target once the slot of its cloud binds', () => {
        const syncManager = createManager('channel');

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        expect(runtimes).toHaveLength(0);

        bindSlot(RELAY, makeClient('relay'));

        expect(runtimeFactory).toHaveBeenCalledTimes(1);
        // start() activates the device runtime's connect-driven save + slot controllers.
        expect(runtimes[0].start).toHaveBeenCalledTimes(1);
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        dispose();

        // dispose doesn't stop immediately — a grace period for a screen transition's re-register window (ADR-0058).
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
    });

    it('유예 내 재등록은 stop도 재시작도 만들지 않는다 — 살아 있는 타깃에 합류한다', () => {
        const syncManager = createManager('channel');
        bindSlot(RELAY, makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS / 2);

        // Room↔home round trip: the next screen re-registers the same target.
        syncManager.register({ type: 'channel', id: 'ch-1' });
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS * 2);

        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        // Re-registration takes the merge path, so startSync only ever fires once — meaning no immediate re-poll.
        expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);
    });

    it("drops a cloud's grace entries when its slot rebinds, so a re-registration starts afresh", () => {
        mockCid = 'cloud-a';
        const syncManager = createManager('channel');
        bindSlot(CLOUD_A, makeClient('cloud-a'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose(); // enters the grace period

        // The slot is rebuilt while the entry is in grace: the departed screen's target must not
        // start polling again on the new runtime.
        bindSlot(CLOUD_A, makeClient('cloud-a-2'));
        const rebuilt = runtimes[1];
        expect(rebuilt.startSync).not.toHaveBeenCalled();

        // If it were still there, this re-registration would take the merge path and startSync
        // would never fire — this catches that regression.
        syncManager.register({ type: 'channel', id: 'ch-1' });
        expect(rebuilt.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        // A discarded grace timer must not belatedly stop the new runtime's target.
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(rebuilt.stopSync).not.toHaveBeenCalled();
    });

    it("keeps another cloud's grace entries when one slot rebinds", () => {
        const syncManager = createManager('channel');
        bindSlot(RELAY, makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'relay-ch' });
        dispose();

        // A cloud slot binding is no business of the relay's registry.
        bindSlot(CLOUD_A, makeClient('cloud-a'));
        syncManager.register({ type: 'channel', id: 'relay-ch' });

        // Still the live relay target, joined by the merge path — no second start.
        expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
    });

    it('destroy()는 유예 타이머를 정리한다 — 파괴 후 지연 stop이 날아오지 않는다', () => {
        const syncManager = createManager('channel');
        bindSlot(RELAY, makeClient('relay'));

        const dispose = syncManager.register({ type: 'channel', id: 'ch-1' });
        dispose();
        syncManager.destroy();

        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
    });

    it('leaves the relay runtime and its targets running when a cloud slot binds', () => {
        const syncManager = createManager('channel');

        bindSlot(RELAY, makeClient('relay'));
        syncManager.register({ type: 'channel', id: 'ch-1' });
        const relayRuntime = runtimes[0];
        expect(relayRuntime.startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

        // A cloud slot binds. The relay runtime must survive — stopping it would kill the relay's
        // connect-driven device.save + keepAlive, leaving a later relay reconnect device-less (the
        // "400 no device linked" push-mute bug). And its targets stay on it: they are the relay's.
        bindSlot(CLOUD_A, makeClient('cloud-a'));

        expect(runtimes).toHaveLength(2);
        const cloudRuntime = runtimes[1];
        expect(relayRuntime.stop).not.toHaveBeenCalled();
        expect(relayRuntime.stopAllSync).not.toHaveBeenCalled();
        expect(relayRuntime.stopSync).not.toHaveBeenCalled();
        expect(cloudRuntime.start).toHaveBeenCalledTimes(1);
        expect(cloudRuntime.startSync).not.toHaveBeenCalled();
    });

    it('detaches a slot runtime when that slot is torn down (slot → null)', () => {
        createManager('channel');
        bindSlot(RELAY, makeClient('relay'));
        bindSlot(CLOUD_A, makeClient('cloud-a'));
        const [relayRuntime, cloudRuntime] = runtimes;

        bindSlot(CLOUD_A, null);

        expect(cloudRuntime.stopAllSync).toHaveBeenCalled();
        expect(cloudRuntime.stop).toHaveBeenCalledTimes(1);
        expect(relayRuntime.stop).not.toHaveBeenCalled();
    });

    it('rebuilding a backgrounded slot replaces only that slot runtime (relay rebuilt under cloud)', () => {
        createManager('channel');
        bindSlot(RELAY, makeClient('relay'));
        bindSlot(CLOUD_A, makeClient('cloud-a'));
        const [relayRuntime, cloudRuntime] = runtimes;

        // Relay slot rebuilds (e.g. token identity change) while cloud stays active: the manager
        // notifies (relay, null) then (relay, newClient).
        bindSlot(RELAY, null);
        bindSlot(RELAY, makeClient('relay-2'));

        expect(relayRuntime.stop).toHaveBeenCalledTimes(1);
        expect(runtimes).toHaveLength(3);
        expect(runtimes[2].start).toHaveBeenCalledTimes(1);
        // The cloud runtime is untouched.
        expect(cloudRuntime.stopAllSync).not.toHaveBeenCalled();
        expect(cloudRuntime.stop).not.toHaveBeenCalled();
    });

    it('builds sync plans per runtime, each for the cloud its slot serves', () => {
        const buildSyncPlans = jest.fn(() => [{ domain: 'channel' } as DomainSyncPlan]);
        createManager('channel', { buildSyncPlans });

        bindSlot(RELAY, makeClient('relay'));
        bindSlot(CLOUD_A, makeClient('cloud-a'));

        expect(buildSyncPlans.mock.calls).toEqual([[RELAY], [CLOUD_A]]);
        expect(runtimeFactory.mock.calls[0][1]).not.toBe(runtimeFactory.mock.calls[1][1]);
    });

    describe('a target runs on the slot of its own cloud and nowhere else', () => {
        it("never starts a cloud's target on another cloud's slot", () => {
            const syncManager = createManager('channel');
            bindSlot(RELAY, makeClient('relay'));
            bindSlot(CLOUD_B, makeClient('cloud-b'));

            syncManager.register({ type: 'channel', id: 'ch-1' }, { cid: 'cloud-a' });

            expect(runtimes[0].startSync).not.toHaveBeenCalled();
            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });

        it("starts it as soon as that cloud's slot binds — being active is not required", () => {
            const syncManager = createManager('place');
            bindSlot(RELAY, makeClient('relay'));

            syncManager.register({ type: 'place', id: '10014' }, { cid: 'cloud-a' });
            bindSlot(CLOUD_A, makeClient('cloud-a'));

            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'place', id: '10014' });
        });

        it('resumes it on the next slot of its cloud after a teardown', () => {
            const syncManager = createManager('channel');

            syncManager.register({ type: 'channel', id: 'ch-1' }, { cid: 'cloud-a' });
            bindSlot(CLOUD_A, makeClient('cloud-a'));
            expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

            // Cloud logout: the slot goes, the registration (the screen is still up) stays.
            bindSlot(CLOUD_A, null);
            bindSlot(RELAY, makeClient('relay'));
            expect(runtimes[1].startSync).not.toHaveBeenCalled();

            bindSlot(CLOUD_A, makeClient('cloud-a-again'));
            expect(runtimes[2].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
        });

        it('defaults the cloud to the one selected at registration', () => {
            const syncManager = createManager('channel');
            bindSlot(RELAY, makeClient('relay'));
            bindSlot(CLOUD_A, makeClient('cloud-a'));

            mockCid = 'cloud-a';
            syncManager.registerChannel('ch-1');
            // A later selection change does not move it.
            mockCid = 'default';

            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });
            expect(runtimes[0].startSync).not.toHaveBeenCalled();
        });

        // Ids are unique inside one cloud only, so the same id in two clouds is two targets.
        it('keeps the same id in two clouds as two targets with their own ref counts', () => {
            const syncManager = createManager('channel');
            bindSlot(CLOUD_A, makeClient('cloud-a'));
            bindSlot(CLOUD_B, makeClient('cloud-b'));

            const disposeA = syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-a' });
            syncManager.register({ type: 'channel', id: '1000001' }, { cid: 'cloud-b' });

            expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);
            expect(runtimes[1].startSync).toHaveBeenCalledTimes(1);

            disposeA();
            jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
            expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'channel', id: '1000001' });
            expect(runtimes[1].stopSync).not.toHaveBeenCalled();
            expect(syncManager.listTargets()).toEqual([{ type: 'channel', id: '1000001', cid: 'cloud-b' }]);
        });

        it('lets the shorthands name the cloud, with or without an interval', () => {
            const syncManager = createManager('join');
            bindSlot(CLOUD_A, makeClient('cloud-a'));

            syncManager.registerJoin('ch-1@uid-a', undefined, { cid: 'cloud-a' });
            syncManager.registerProfile('p-1@uid-a', 60_000, { cid: 'cloud-a' });

            expect(syncManager.listTargets()).toEqual([
                { type: 'join', id: 'ch-1@uid-a', cid: 'cloud-a' },
                { type: 'profile', id: 'p-1@uid-a', intervalMs: 60_000, cid: 'cloud-a' },
            ]);
        });

        it('refuses a word that is not a cloud id, and records nothing', () => {
            const syncManager = createManager('channel');

            expect(() => syncManager.register({ type: 'channel', id: 'ch-1' }, { cid: 'cloud' })).toThrow(
                /not a cloud id/
            );
            expect(syncManager.listTargets()).toEqual([]);
        });
    });

    it('registers a chat target and stops it on dispose', () => {
        const syncManager = createManager('chat');
        bindSlot(RELAY, makeClient('relay'));

        const dispose = syncManager.registerChat('ch-1');
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });

        dispose();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' });
    });

    /**
     * The account-axis (uid) guard — a production report is where this test comes from.
     *
     * `403 FORBIDDEN - not allowed to read join @getJoinDetail(U:1000003@1000003)`, with the calling
     * session's uid at 1000891 and `cid` at `#` (relay). Relay keeps its cid at 'default' even
     * across an account change, so a guard that only looks at cid couldn't see the account swap. The
     * self-chat join target registered by the 1000003 session kept being polled under the 1000891 session.
     */
    describe('계정이 바뀌면 이전 세션의 타깃은 따라가지 않는다', () => {
        it('does not start on a rebuilt slot once the uid moved, even with the same cloud', () => {
            const syncManager = createManager('join');
            // Relay stays on the same cid even across an account change — that's the very condition
            // where the bug was hiding.
            bindSlot(RELAY, makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerJoin('U:1000003@1000003');
            expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });

            // Swap only the account on the same socket (guest→social promotion, logout→login).
            mockUid = '1000891';
            bindSlot(RELAY, makeClient('relay-b'));

            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });

        it('starts on a rebuilt slot when the uid is unchanged — the guard does not over-block', () => {
            const syncManager = createManager('join');
            bindSlot(RELAY, makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerJoin('U:1000003@1000003');
            bindSlot(RELAY, makeClient('relay-b'));

            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });
        });

        /**
         * The real trap is a domain whose key has no uid in it (channel/chat/device). `channel:1000001`
         * is the same string no matter who's logged in, so if a re-registration joins the previous
         * account's entry, the tag stays stale.
         */
        it('같은 키를 새 계정이 재등록하면 이전 태그에 합류하지 않는다', () => {
            const syncManager = createManager('channel');
            bindSlot(RELAY, makeClient('relay-a'));

            mockUid = '1000003';
            syncManager.registerChannel('1000001');
            expect(runtimes[0].startSync).toHaveBeenCalledTimes(1);

            mockUid = '1000891';
            syncManager.registerChannel('1000001');

            // If it had joined, only refs would rise and startSync would fire just once. Starting fresh
            // under the new account is the correct behavior.
            expect(runtimes[0].startSync).toHaveBeenCalledTimes(2);
            // And the previous account's tag must not survive — it would come back on the next rebind.
            bindSlot(RELAY, makeClient('relay-b'));
            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'channel', id: '1000001' });
        });

        // A target registered with no session is not a wildcard.
        it('세션 없이 등록된 타깃은 세션이 붙어도 replay되지 않는다', () => {
            const syncManager = createManager('channel');
            bindSlot(RELAY, makeClient('relay-a'));

            mockUid = null;
            syncManager.registerChannel('1000001');
            expect(runtimes[0].startSync).not.toHaveBeenCalled();

            mockUid = '1000891';
            bindSlot(RELAY, makeClient('relay-b'));
            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });

        // Every cloud gives the account its own uid, so the one to compare is the target's cloud's.
        it("judges a target by this account's uid in the target's own cloud", () => {
            mockUids = { default: 'relay-uid', 'cloud-a': 'uid-a' };
            const syncManager = createManager('channel');
            bindSlot(RELAY, makeClient('relay'));
            bindSlot(CLOUD_A, makeClient('cloud-a'));

            syncManager.register({ type: 'channel', id: 'ch-1' }, { cid: 'cloud-a' });
            expect(runtimes[1].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-1' });

            // The relay account moves; the uid in cloud-a does not — its target stays.
            mockUids = { default: 'relay-uid-2', 'cloud-a': 'uid-a' };
            emitSession();

            expect(runtimes[1].stopSync).not.toHaveBeenCalled();
            expect(syncManager.listTargets()).toHaveLength(1);
        });
    });

    /**
     * The scenario a user reproduced for us: guest → social login → navigate to home.
     *
     * Promotion keeps the same socket and only swaps the identity (`reauthenticateActiveSocket`). With
     * no client swap, no slot notification fires — the guest's already-running target just keeps
     * polling, throwing `join.get {id:"U:<guest>@<guest>"}`, and the server answers every one with
     * 403. A guard that only blocks starts can't catch this path.
     */
    it('같은 소켓 위 계정 승격은 이전 계정의 타깃을 즉시 멈춘다', () => {
        const syncManager = createManager('join');
        bindSlot(RELAY, makeClient('relay'));

        mockUid = '1000003';
        syncManager.registerJoin('U:1000003@1000003');
        expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });

        // Social login — the socket stays, only the identity changes.
        promoteTo('1000891');

        // Must stop immediately without waiting for the grace period. The join plan's cadence is
        // 10s, so a 30s grace would produce three more 403s per promotion.
        expect(runtimes[0].stopSync).toHaveBeenCalledWith({ type: 'join', id: 'U:1000003@1000003' });
        expect(syncManager.listTargets()).toHaveLength(0);
    });

    it('계정이 그대로인 세션 변화(토큰 갱신 등)는 타깃을 건드리지 않는다', () => {
        const syncManager = createManager('join');
        bindSlot(RELAY, makeClient('relay'));

        mockUid = '1000003';
        syncManager.registerJoin('U:1000003@1000003');

        promoteTo('1000003');

        expect(runtimes[0].stopSync).not.toHaveBeenCalled();
        expect(syncManager.listTargets()).toHaveLength(1);
    });

    /**
     * An app registers without naming a cloud and builds uid-bearing ids (`join` is `<channel>@<uid>`)
     * from the session. In a switch window the session still has the outgoing cloud's uid while the
     * incoming cloud's is already known, so judging such a target by the cloud's uid would keep a
     * stale id alive past the commit — and poll it on the incoming slot once that slot is up.
     */
    describe('a target registered without a cloud is judged by the session uid', () => {
        it('never starts a switch-window registration, and retires it at the commit', () => {
            mockUids = { 'cloud-b': 'uid-b' };
            mockSessionUid = 'uid-a'; // still the outgoing cloud's
            mockCid = 'cloud-b';
            const syncManager = createManager('join');
            bindSlot(CLOUD_B, makeClient('cloud-b'));

            syncManager.registerJoin('ch-b@uid-a');
            expect(runtimes[0].startSync).not.toHaveBeenCalled();

            // The commit: the session now has B's uid.
            mockSessionUid = 'uid-b';
            emitSession();

            expect(syncManager.listTargets()).toEqual([]);
            bindSlot(CLOUD_B, makeClient('cloud-b-2'));
            expect(runtimes[1].startSync).not.toHaveBeenCalled();
        });

        it('judges a registration that names its cloud by that cloud’s uid, window or not', () => {
            mockUids = { 'cloud-b': 'uid-b' };
            mockSessionUid = 'uid-a';
            const syncManager = createManager('channel');
            bindSlot(CLOUD_B, makeClient('cloud-b'));

            syncManager.register({ type: 'channel', id: 'ch-b' }, { cid: 'cloud-b' });

            expect(runtimes[0].startSync).toHaveBeenCalledWith({ type: 'channel', id: 'ch-b' });
        });
    });

    // Retiring an entry frees its key for a new registration; the retired one's owner still holds a
    // dispose, and it must not release a ref it never took on the new entry.
    it('ignores a dispose from a registration whose entry was retired and replaced', () => {
        const syncManager = createManager('channel');
        bindSlot(RELAY, makeClient('relay'));

        mockUid = '1000003';
        const disposeOld = syncManager.registerChannel('1000001');
        promoteTo('1000891');
        syncManager.registerChannel('1000001');

        disposeOld();
        jest.advanceTimersByTime(UNREGISTER_GRACE_MS);

        expect(runtimes[0].stopSync).toHaveBeenCalledTimes(1); // the retirement, nothing after
        expect(syncManager.listTargets()).toEqual([{ type: 'channel', id: '1000001', cid: 'default' }]);
    });

    it('reads each cloud’s uid once per session change, however many targets it has', () => {
        const getUid = jest.fn(uidIn);
        const syncManager = createManager('channel', { getUid });
        bindSlot(CLOUD_A, makeClient('cloud-a'));
        for (const id of ['1', '2', '3']) syncManager.register({ type: 'channel', id }, { cid: 'cloud-a' });
        syncManager.registerChannel('relay-1');

        getUid.mockClear();
        emitSession();

        expect(getUid.mock.calls).toEqual([['cloud-a'], ['default']]);
    });

    it('lists each target with the cloud it belongs to', () => {
        const syncManager = createManager('channel');

        syncManager.registerChannel('ch-1');
        syncManager.register({ type: 'channel', id: 'ch-1' }, { cid: 'cloud-a' });

        expect(syncManager.listTargets()).toEqual([
            { type: 'channel', id: 'ch-1', cid: 'default' },
            { type: 'channel', id: 'ch-1', cid: 'cloud-a' },
        ]);
    });

    // A refusal is keyed by channel id alone, and ids repeat across clouds and accounts.
    it('forgets remembered refusals when the session uid changes, and only then', () => {
        createManager('channel');
        recordRefusedChannel('ch-1');

        emitSession();
        expect(isChannelRefused('ch-1')).toBe(true);

        mockSessionUid = 'user-b';
        emitSession();
        expect(isChannelRefused('ch-1')).toBe(false);
    });

    describe('updateLocalSnapshot', () => {
        it("hands the snapshot to the runtime of the selected cloud's slot by default", () => {
            const syncManager = createManager('chat');
            bindSlot(RELAY, makeClient('relay'));
            bindSlot(CLOUD_A, makeClient('cloud-a'));
            mockCid = 'cloud-a';

            syncManager.updateLocalSnapshot(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
            );

            expect(runtimes[1].updateLocalSnapshot).toHaveBeenCalledWith(
                { type: 'chat', id: 'ch-1' },
                { id: 'ch-1', lastNo: 9, minNo: 0, messages: [] }
            );
            expect(runtimes[0].updateLocalSnapshot).not.toHaveBeenCalled();
        });

        it('hands it to the named cloud when one is given', () => {
            const syncManager = createManager('chat');
            bindSlot(RELAY, makeClient('relay'));
            bindSlot(CLOUD_A, makeClient('cloud-a'));

            syncManager.updateLocalSnapshot({ type: 'chat', id: 'ch-1' }, { lastNo: 3 }, { cid: 'cloud-a' });

            expect(runtimes[1].updateLocalSnapshot).toHaveBeenCalledWith({ type: 'chat', id: 'ch-1' }, { lastNo: 3 });
            expect(runtimes[0].updateLocalSnapshot).not.toHaveBeenCalled();
        });

        it("is a no-op while that cloud's slot is not bound", () => {
            const syncManager = createManager('chat');
            bindSlot(RELAY, makeClient('relay'));

            expect(() =>
                syncManager.updateLocalSnapshot({ type: 'chat', id: 'ch-1' }, { lastNo: 0 }, { cid: 'cloud-a' })
            ).not.toThrow();
            expect(runtimes[0].updateLocalSnapshot).not.toHaveBeenCalled();
        });
    });

    it('reference-counts duplicate registrations before stopping a target', () => {
        const syncManager = createManager('place');
        bindSlot(RELAY, makeClient('relay'));

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
        const syncManager = createManager('channel');
        bindSlot(RELAY, makeClient('relay'));
        bindSlot(CLOUD_A, makeClient('cloud-a'));

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
            getUid: uidIn,
            getSessionUid: sessionUid,
            getCid: () => mockCid,
            subscribeSession,
            buildSyncPlans: () => plans,
            runtimeOptions,
        });

        const client = makeClient('relay');
        bindSlot(RELAY, client);

        expect(mockedCreateDeviceRuntime).toHaveBeenCalledWith({
            client,
            extraSyncPlans: plans,
            ...runtimeOptions,
        });
    });
});
