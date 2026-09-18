import { requestRelaySessionRefresh, resetRelayRefreshCoalescing } from './requestRelaySessionRefresh';
import type { ISocketManager } from '../types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// `getAuthStatus` (ADR-0076 Decision 1) reads the store's token and the credential clock on top of the
// socket, so both have to be seeded here. That is a real input the pre-refactor condition did NOT
// have — see the commit message; a bound socket with no stored token now reads `absent`, which is
// the safe direction.
jest.mock('../../session/store/stores', () => ({
    relayStore: { getIdentityToken: () => 'relay-idt' },
    cloudStore: { getIdentityToken: () => 'cloud-idt' },
}));
jest.mock('../../session/auth/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: () => 30 * 60_000, isStale: () => false },
}));

/**
 * Fake AuthController. `refresh()` is the SDK's public call (sockets-lib 0.5.1) and its promise IS
 * the answer, so the fake needs no listener emitters — the old one had them because this module used
 * to guess at completion from `onTokenRefresh`/`onAuthState`.
 *
 * `deferRefresh` hands back the settle functions for the cases that need a refresh to still be
 * in flight while a second caller arrives.
 */
const makeAuth = ({ state = 'authenticated' } = {}) => {
    let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;
    return {
        state,
        refresh: jest.fn(
            () =>
                new Promise<unknown>((resolve, reject) => {
                    settle = { resolve: () => resolve({ Token: { identityToken: 'fresh' } }), reject };
                })
        ),
        /** Settles the refresh currently in flight. */
        finishRefresh: () => settle?.resolve(),
        failRefresh: (message = 'auth.refresh failed: sign') => settle?.reject(new Error(message)),
    };
};

type FakeAuth = ReturnType<typeof makeAuth>;

// `isKindVerified` is DERIVED here, not a free knob. The real SocketManager computes it as
// `authenticated && connState === 'connected'` and clears it on every non-connected transition, so a
// fake that reports `verified` for a closed socket describes a state the manager cannot produce.
// That mattered once `deriveAuthStatus` started trusting this flag instead of re-reading the
// transport (ADR-0076 Decision 1): the stale fake was the only thing claiming a closed socket could
// carry a refresh. `verified` can still be forced to false to model a mid-handshake connection.
const makeManager = (client: { auth?: FakeAuth; state?: string } | null, { verified = true } = {}): ISocketManager =>
    ({
        getClient: jest.fn(() => client),
        isKindVerified: jest.fn(
            () => verified && client?.state === 'connected' && client?.auth?.state === 'authenticated'
        ),
    }) as unknown as ISocketManager;

describe('requestRelaySessionRefresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Attempts are coalesced per kind in module state; without this each case would inherit the
        // previous one's memoized answer instead of driving its own refresh.
        resetRelayRefreshCoalescing();
    });

    it('drives the refresh through a live authenticated controller and resolves on the writeback', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        expect(auth.refresh).toHaveBeenCalledTimes(1);

        auth.finishRefresh();
        await expect(pending).resolves.toBe(true);
    });

    it('reports false when the socket refresh rejects', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        auth.failRefresh();

        await expect(pending).resolves.toBe(false);
    });

    // A rejection is only the answer to this attempt, not a session verdict — the controller's
    // backoff keeps running behind it, and whether it goes terminal is the controller's call. The
    // reason only rides along in the message, so this doesn't branch on it.
    it('거부 사유가 무엇이든 false 하나로 답한다 — 분기하지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        auth.failRefresh('408 REQUEST TIMEOUT - auth.refresh[mid-1]');

        await expect(pending).resolves.toBe(false);
    });

    // A completion ceiling is no longer ours to hold. It used to be needed as a 10s ceiling because
    // the old code called the private `runRefresh` via a cast and guessed completion from a
    // subscription. `refresh()` now rides the socket's `request`, so it gets rejected by its own
    // transport timeout (`408`), and that rejection IS the answer — holding a timer here would just
    // be a second ceiling racing the SDK's own.
    it('자체 타임아웃을 걸지 않는다 — 미해결 refresh는 미해결로 남는다', async () => {
        jest.useFakeTimers();
        try {
            const auth = makeAuth();
            const manager = makeManager({ auth, state: 'connected' });

            let settled = false;
            void requestRelaySessionRefresh({ manager }).then(() => {
                settled = true;
            });

            jest.advanceTimersByTime(60_000);
            await Promise.resolve();

            expect(settled).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    // ADR-0070 invariants 1·2 — refresh belongs to ClientSocketAuth alone. With no socket, it rejects
    // instead of finding a way around it. This used to fall back to a service-level HTTP refresh here,
    // which was a second path to the refresh endpoint — one that updated only the store and left the
    // socket's own signing material stale, which is exactly the source of the divergence.
    it('바인드된 슬롯이 없으면 refresh하지 않고 false를 돌려준다', async () => {
        await expect(requestRelaySessionRefresh({ manager: makeManager(null) })).resolves.toBe(false);
    });

    it('소켓이 연결되지 않았으면 refresh하지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'closed' });

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('컨트롤러가 authenticated가 아니면 refresh하지 않는다 (백오프/만료 중)', async () => {
        const auth = makeAuth({ state: 'expired' });
        const manager = makeManager({ auth, state: 'connected' });

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(auth.refresh).not.toHaveBeenCalled();
    });

    // Right after a reconnect, the SDK's `auth.state` still carries the 'authenticated' of the dead
    // connection (`stop()` only turns off the active flag and timers, it doesn't touch the state
    // value). Firing in that window hits a new connection with no device attached yet, so the server
    // rejects with `400 BAD REQUEST - no device linked @auth.refresh(...)` — not a session problem but
    // a race, and it still burns one attempt. So this also checks the slot-verified flag that tracks
    // the current connection.
    it('연결은 됐지만 이번 연결의 핸드셰이크가 안 끝났으면 refresh하지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' }, { verified: false });

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('슬롯 검증도 relay 슬롯에 묻는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        auth.finishRefresh();
        await expect(pending).resolves.toBe(true);

        expect(manager.isKindVerified).toHaveBeenCalledWith('relay');
    });

    // This trigger is relay-only. A cloud token is **reissued** from the relay identity
    // (renewCloudSession), so it isn't something refresh fixes — which is why there's no kind
    // argument at all.
    it('relay 슬롯만 본다 — cloud 슬롯이 살아 있어도 그쪽으로 가지 않는다', async () => {
        const relayAuth = makeAuth({ state: 'expired' });
        const cloudAuth = makeAuth();
        const manager = {
            getClient: jest.fn((kind: string) => ({
                auth: kind === 'relay' ? relayAuth : cloudAuth,
                state: 'connected',
            })),
            isKindVerified: jest.fn(() => true),
        } as unknown as ISocketManager;

        // False because relay isn't authenticated. It doesn't fall back to a live cloud.
        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledWith('relay');
        expect(cloudAuth.refresh).not.toHaveBeenCalled();
    });
});

/**
 * Absorbing simultaneous and back-to-back requests.
 *
 * Epoch pile-up (the path where an earlier attempt is invalidated and counted as a timeout failure,
 * filling up maxFailures by our own hand) is now blocked by the SDK — `refresh()` joins an in-flight
 * renewal (0.5.1). What's left here is the share of attempts that **never even reach** the SDK: the
 * "no authenticated socket" verdict is decided before `refresh()` is called, so the SDK's join-in-
 * flight can't absorb it, and memoizing a just-finished answer is a question the SDK never gets asked.
 */
describe('requestRelaySessionRefresh — 중복 억제', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetRelayRefreshCoalescing();
    });

    it('동시 호출은 refresh 한 번을 공유한다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const a = requestRelaySessionRefresh({ manager });
        const b = requestRelaySessionRefresh({ manager });
        const c = requestRelaySessionRefresh({ manager });

        expect(auth.refresh).toHaveBeenCalledTimes(1);

        auth.finishRefresh();
        await expect(Promise.all([a, b, c])).resolves.toEqual([true, true, true]);
    });

    it('방금 성공했으면 다시 묻지 않고 성공을 그대로 답한다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const first = requestRelaySessionRefresh({ manager });
        auth.finishRefresh();
        await expect(first).resolves.toBe(true);

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(true);
        expect(auth.refresh).toHaveBeenCalledTimes(1);
    });

    it('방금 실패했으면 다시 때리지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const first = requestRelaySessionRefresh({ manager });
        auth.failRefresh();
        await expect(first).resolves.toBe(false);

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(auth.refresh).toHaveBeenCalledTimes(1);
    });

    it('소켓이 없어 시도조차 못 한 결과도 흡수한다 — warn 폭주를 막는다', async () => {
        const manager = makeManager(null);

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        // How many manager reads ONE attempt costs is an implementation detail (the status snapshot
        // reads the client more than once). What this case is about is that the SECOND request runs
        // no attempt at all, so measure the delta rather than an absolute count.
        const readsAfterFirstAttempt = (manager.getClient as jest.Mock).mock.calls.length;
        expect(readsAfterFirstAttempt).toBeGreaterThan(0);

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledTimes(readsAfterFirstAttempt);
    });

    it('메모 창이 지나면 다시 시도한다 — 캐시가 아니라 버스트 흡수기다', async () => {
        jest.useFakeTimers();
        try {
            const auth = makeAuth();
            const manager = makeManager({ auth, state: 'connected' });

            const first = requestRelaySessionRefresh({ manager });
            auth.failRefresh();
            await expect(first).resolves.toBe(false);

            jest.advanceTimersByTime(3_000);

            void requestRelaySessionRefresh({ manager });
            expect(auth.refresh).toHaveBeenCalledTimes(2);
            auth.failRefresh();
        } finally {
            jest.useRealTimers();
        }
    });
});
