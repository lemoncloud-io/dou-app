import { requestRelaySessionRefresh, resetRelayRefreshCoalescing } from './requestRelaySessionRefresh';
import type { ISocketManager } from '@chatic/transport/socket/types';
import { RELAY_SLOT } from '@chatic/transport/socket/utils/slotKey';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@chatic/session/store/stores', () => ({
    relayStore: { getIdentityToken: () => 'relay-idt' },
    cloudStore: { getIdentityToken: () => 'cloud-idt' },
}));
jest.mock('@chatic/session/store/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: () => 30 * 60_000, isStale: () => false },
}));

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
        finishRefresh: () => settle?.resolve(),
        failRefresh: (message = 'auth.refresh failed: sign') => settle?.reject(new Error(message)),
    };
};

type FakeAuth = ReturnType<typeof makeAuth>;

const makeManager = (client: { auth?: FakeAuth; state?: string } | null, { verified = true } = {}): ISocketManager =>
    ({
        getClient: jest.fn(() => client),
        isSlotVerified: jest.fn(
            () => verified && client?.state === 'connected' && client?.auth?.state === 'authenticated'
        ),
    }) as unknown as ISocketManager;

describe('requestRelaySessionRefresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

    it('거부 사유가 무엇이든 false 하나로 답한다 — 분기하지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        auth.failRefresh('408 REQUEST TIMEOUT - auth.refresh[mid-1]');

        await expect(pending).resolves.toBe(false);
    });

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

        expect(manager.isSlotVerified).toHaveBeenCalledWith(RELAY_SLOT);
    });

    it('relay 슬롯만 본다 — cloud 슬롯이 살아 있어도 그쪽으로 가지 않는다', async () => {
        const relayAuth = makeAuth({ state: 'expired' });
        const cloudAuth = makeAuth();
        const manager = {
            getClient: jest.fn((key: string) => ({
                auth: key === RELAY_SLOT ? relayAuth : cloudAuth,
                state: 'connected',
            })),
            isSlotVerified: jest.fn(() => true),
        } as unknown as ISocketManager;

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledWith(RELAY_SLOT);
        expect(cloudAuth.refresh).not.toHaveBeenCalled();
    });
});

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
        const readsAfterFirstAttempt = (manager.getClient as jest.Mock).mock.calls.length;
        expect(readsAfterFirstAttempt).toBeGreaterThan(0);

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledTimes(readsAfterFirstAttempt);
    });

    it('does not answer from a "still handshaking" memo once the relay slot has verified', async () => {
        const auth = makeAuth();
        const client = { auth, state: 'connected' };
        let verified = false;
        const manager = {
            getClient: jest.fn(() => client),
            isSlotVerified: jest.fn(() => verified),
        } as unknown as ISocketManager;

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(auth.refresh).not.toHaveBeenCalled();

        verified = true;
        const pending = requestRelaySessionRefresh({ manager });
        expect(auth.refresh).toHaveBeenCalledTimes(1);

        auth.finishRefresh();
        await expect(pending).resolves.toBe(true);
    });

    it('keeps absorbing an "expired" memo even with the relay slot verified', async () => {
        const auth = makeAuth({ state: 'expired' });
        const client = { auth, state: 'connected' };
        const manager = {
            getClient: jest.fn(() => client),
            isSlotVerified: jest.fn(() => true),
        } as unknown as ISocketManager;

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        const readsAfterFirstAttempt = (manager.getClient as jest.Mock).mock.calls.length;

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        expect(manager.getClient).toHaveBeenCalledTimes(readsAfterFirstAttempt);
        expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('keeps absorbing a "no socket" memo while the relay slot is still unverified', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' }, { verified: false });

        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);
        const readsAfterFirstAttempt = (manager.getClient as jest.Mock).mock.calls.length;

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
