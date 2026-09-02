import { requestRelaySessionRefresh, resetRelayRefreshCoalescing } from './requestRelaySessionRefresh';
import type { ISocketManager } from '../types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// `@chatic/web-config` is the sole `import.meta` holder (ADR-0070 결정 6); ts-jest's CommonJS
// transform cannot parse it, and HttpManager pulls it in transitively.
jest.mock('@chatic/web-config', () => new Proxy({}, { get: () => jest.fn() }));

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

const makeManager = (client: { auth?: FakeAuth; state?: string } | null, { verified = true } = {}): ISocketManager =>
    ({
        getClient: jest.fn(() => client),
        isKindVerified: jest.fn(() => verified),
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

    // 거부는 이 시도의 답일 뿐, 세션 판정이 아니다 — 컨트롤러의 백오프가 뒤에서 계속 돌고 터미널
    // 전환 여부는 컨트롤러가 정한다. 사유는 메시지에만 실리므로 분기하지 않는다.
    it('거부 사유가 무엇이든 false 하나로 답한다 — 분기하지 않는다', async () => {
        const auth = makeAuth();
        const manager = makeManager({ auth, state: 'connected' });

        const pending = requestRelaySessionRefresh({ manager });
        auth.failRefresh('408 REQUEST TIMEOUT - auth.refresh[mid-1]');

        await expect(pending).resolves.toBe(false);
    });

    // 완료 상한은 이제 우리 것이 아니다. 예전에는 private `runRefresh`를 캐스팅으로 부르고 완료를
    // 구독으로 추측했으므로 10초 천장이 필요했다. `refresh()`는 소켓 `request`를 타므로 자체 전송
    // 타임아웃(`408`)으로 거부되고, 그 거부가 곧 답이다 — 여기서 타이머를 들고 있으면 SDK의 상한과
    // 경쟁하는 두 번째 상한이 된다.
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

    // ADR-0070 불변조건 1·2 — refresh는 ClientSocketAuth 단독. 소켓이 없으면 우회하지 않고 거절한다.
    // 예전에는 여기서 서비스 레벨 HTTP refresh로 폴백했는데, 그게 refresh 엔드포인트로 가는 두 번째
    // 경로였고, 스토어만 갱신하고 소켓 자신의 서명 재료는 그대로 두는 divergence의 원인이었다.
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

    // 재연결 직후 SDK `auth.state`는 죽은 연결의 'authenticated'를 그대로 들고 있다(`stop()`은
    // active·타이머만 끄고 상태값은 안 건드린다). 그 창에 쏘면 새 연결에는 아직 device가 안 붙어 있어
    // 서버가 `400 BAD REQUEST - no device linked @auth.refresh(...)`로 거절한다 — 세션 문제가 아니라
    // 경합인데 시도 한 번을 태운다. 그래서 현재 연결을 추적하는 슬롯 검증 플래그를 함께 본다.
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

    // 이 트리거는 relay 전용이다. cloud 토큰은 relay 신원에서 **재발급**되므로(renewCloudSession)
    // refresh로 고칠 대상이 아니고, 그래서 kind 인자 자체가 없다.
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

        // relay가 인증되지 않았으므로 false. 살아 있는 cloud로 우회하지 않는다.
        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledWith('relay');
        expect(cloudAuth.refresh).not.toHaveBeenCalled();
    });
});

/**
 * 동시·연속 요청 흡수.
 *
 * epoch 파일업(앞선 시도가 무효화되고 타임아웃 후 실패로 집계돼 maxFailures를 우리 손으로 채우는
 * 경로)은 이제 SDK가 막는다 — `refresh()`가 진행 중인 갱신에 합류한다(0.5.1). 여기 남은 몫은 SDK에
 * **닿지도 못하는** 시도다: "인증된 소켓 없음" 판정은 `refresh()` 호출 전에 끝나므로 SDK의 합류가
 * 흡수할 수 없고, 방금 끝난 답을 재사용하는 메모는 SDK가 답하지 않는 질문이다.
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
        await expect(requestRelaySessionRefresh({ manager })).resolves.toBe(false);

        expect(manager.getClient).toHaveBeenCalledTimes(1);
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
