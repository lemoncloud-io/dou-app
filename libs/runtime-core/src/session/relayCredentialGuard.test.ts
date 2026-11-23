import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { logger } from '@chatic/logger';

import { RelayCredentialGuard } from './relayCredentialGuard';
import type { SessionStalenessPolicy } from './relayCredentialGuard';
import { foregroundPlatform } from './foreground';

const mockHasStored = jest.fn();
const mockIsExpired = jest.fn();
const mockRequestRefresh = jest.fn();

jest.mock('@chatic/auth/session/relayCredentialProbe', () => ({
    relayCredentialProbe: {
        hasSession: (...a: unknown[]) => mockHasStored(...a),
        isCredentialExpired: (...a: unknown[]) => mockIsExpired(...a),
    },
}));
jest.mock('@chatic/auth/socket/requestRelaySessionRefresh', () => ({
    requestRelaySessionRefresh: (...a: unknown[]) => mockRequestRefresh(...a),
}));
const mockAuthStatus = jest.fn();
jest.mock('@chatic/auth/socket/authStatus', () => ({
    getAuthStatus: (...a: unknown[]) => mockAuthStatus(...(a as [])),
    canRefreshThroughSocket: (status: string) => status === 'verified' || status === 'stale',
}));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockTimeToExpiry = jest.fn();
jest.mock('@chatic/session/store/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: (...a: unknown[]) => mockTimeToExpiry(...(a as [])), isStale: jest.fn() },
}));

let relayVerified = false;
let notifyVerified: (verified: boolean) => void = () => undefined;
jest.mock('@chatic/transport/socket/runtime', () => ({
    getSocketManager: () => ({
        isSlotVerified: () => relayVerified,
        subscribeSlotVerified: (_key: string, listener: (verified: boolean) => void) => {
            notifyVerified = listener;
            listener(relayVerified);
            return () => {
                notifyVerified = () => undefined;
            };
        },
        getSlotKeys: () => [],
    }),
}));

let online = true;
let visible = true;
let notifyForeground: () => void = () => undefined;

const warned = (message: string) =>
    (logger.warn as jest.Mock).mock.calls.some(([, text]) => typeof text === 'string' && text.includes(message));

const started: Array<() => void> = [];
afterEach(() => started.splice(0).forEach(stop => stop()));

const startGuard = (policy: SessionStalenessPolicy) => {
    const guard = new RelayCredentialGuard(policy);
    started.push(guard.start());
    return guard;
};

const runCheck = async (policy: SessionStalenessPolicy = {}) => {
    const guard = new RelayCredentialGuard({ intervalMs: null, ...policy });
    await guard.check();
    return guard;
};

beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockHasStored.mockReturnValue(true);
    mockIsExpired.mockReturnValue(false);
    mockRequestRefresh.mockResolvedValue(true);
    mockTimeToExpiry.mockReturnValue(null);
    mockAuthStatus.mockReturnValue('stale');
    relayVerified = false;
    online = true;
    visible = true;
    transportPlatform.configure(
        fakeTransportPorts({ online: { read: () => online, subscribe: () => () => undefined } })
    );
    foregroundPlatform.configure({
        read: () => visible,
        subscribe: listener => {
            notifyForeground = listener;
            return () => {
                notifyForeground = () => undefined;
            };
        },
    });
});

describe('RelayCredentialGuard — 프로브', () => {
    it('만료되지 않았으면 refresh를 요청하지 않는다 (정상 구간)', async () => {
        await runCheck();

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('만료됐으면 requestRelaySessionRefresh로 넘긴다 — 직접 refresh하지 않는다', async () => {
        mockIsExpired.mockReturnValue(true);

        await runCheck();

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('does not even probe while offline', async () => {
        online = false;

        await runCheck();

        expect(mockHasStored).not.toHaveBeenCalled();
    });

    it('does nothing without a stored session', async () => {
        mockHasStored.mockReturnValue(false);
        mockIsExpired.mockReturnValue(true);

        await runCheck();

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });
});

describe('RelayCredentialGuard — a refresh that did not run', () => {
    beforeEach(() => {
        mockIsExpired.mockReturnValue(true);
        mockRequestRefresh.mockResolvedValue(false);
    });

    it('says the socket could not carry it when it was handshaking', async () => {
        mockAuthStatus.mockReturnValue('handshaking');

        await runCheck();

        expect(warned('cannot carry a refresh')).toBe(true);
        expect(warned('stale relay credentials not refreshed')).toBe(false);
    });

    it('says the same for a terminal expired — the renewer owns that decision', async () => {
        mockAuthStatus.mockReturnValue('expired');

        await runCheck();

        expect(warned('cannot carry a refresh')).toBe(true);
    });

    it('calls the credential stale when a socket that could ask was refused', async () => {
        mockAuthStatus.mockReturnValue('verified');

        await runCheck();

        expect(warned('stale relay credentials not refreshed')).toBe(true);
    });

    it('swallows a throw and only logs it — the next trigger tries again', async () => {
        mockHasStored.mockImplementation(() => {
            throw new Error('storage race');
        });

        await expect(runCheck()).resolves.toBeDefined();

        expect(warned('credential probe failed')).toBe(true);
    });
});

describe('RelayCredentialGuard — forceRefresh (부팅/포그라운드 선제 갱신)', () => {
    it('만료되지 않았어도 refresh를 요청한다', async () => {
        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('쿨다운 안에서는 두 번째 트리거를 흘려보낸다 (포그라운드 연타 방어)', async () => {
        const guard = new RelayCredentialGuard({ intervalMs: null, forceRefresh: true });
        await guard.check();
        await guard.check();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('쿨다운이 지나면 다시 요청한다', async () => {
        jest.useFakeTimers();
        const guard = new RelayCredentialGuard({ intervalMs: null, forceRefresh: true });
        await guard.check();
        jest.setSystemTime(Date.now() + 61_000);
        await guard.check();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(2);
    });

    it('a preemptive refresh that did not run is a warning, not a stale credential', async () => {
        mockRequestRefresh.mockResolvedValue(false);

        await runCheck({ forceRefresh: true });

        expect(warned('preemptive relay refresh did not run')).toBe(true);
        expect(warned('stale relay credentials not refreshed')).toBe(false);
    });

    it('오프라인이면 forceRefresh여도 아무 요청도 하지 않는다', async () => {
        online = false;

        await runCheck({ forceRefresh: true });

        expect(mockHasStored).not.toHaveBeenCalled();
        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('저장된 세션이 아예 없으면 forceRefresh여도 refresh로 넘어가지 않는다', async () => {
        mockHasStored.mockReturnValue(false);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('takes the forceRefresh of the policy it was last given', async () => {
        const guard = new RelayCredentialGuard({ intervalMs: null });
        guard.setPolicy({ intervalMs: null, forceRefresh: true });

        await guard.check();

        expect(mockRequestRefresh).toHaveBeenCalled();
    });
});

describe('RelayCredentialGuard — 트리거', () => {
    it('intervalMs 주기로 검사한다', async () => {
        jest.useFakeTimers();
        mockIsExpired.mockReturnValue(true);

        startGuard({ intervalMs: 30_000 });
        await jest.advanceTimersByTimeAsync(60_000);

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('enabled=false면 아무 트리거도 걸지 않는다', async () => {
        jest.useFakeTimers();
        relayVerified = true;

        startGuard({ enabled: false, intervalMs: 30_000, checkOnVisible: true, checkOnRelayVerified: true });
        await jest.advanceTimersByTimeAsync(120_000);
        notifyForeground();

        expect(mockHasStored).not.toHaveBeenCalled();
    });

    it('checkOnRelayVerified는 상승 에지에서만 검사한다', async () => {
        mockIsExpired.mockReturnValue(true);

        startGuard({ intervalMs: null, checkOnRelayVerified: true });
        await Promise.resolve();
        expect(mockRequestRefresh).not.toHaveBeenCalled();

        relayVerified = true;
        notifyVerified(true);
        await Promise.resolve();
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);

        notifyVerified(true);
        await Promise.resolve();
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('a socket already verified when the guard starts is a rising edge', async () => {
        mockIsExpired.mockReturnValue(true);
        relayVerified = true;

        startGuard({ intervalMs: null, checkOnRelayVerified: true });
        await Promise.resolve();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('a stop and a start do not re-fire the edge the first start already saw', async () => {
        mockIsExpired.mockReturnValue(true);
        relayVerified = true;
        const guard = new RelayCredentialGuard({ intervalMs: null, checkOnRelayVerified: true });

        guard.start()();
        await new Promise(resolve => setImmediate(resolve));
        started.push(guard.start());
        await new Promise(resolve => setImmediate(resolve));

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('turning the guard on while relay is already verified probes once', async () => {
        mockIsExpired.mockReturnValue(true);
        relayVerified = true;
        const guard = new RelayCredentialGuard({ enabled: false, intervalMs: null, checkOnRelayVerified: true });
        guard.start();

        guard.setPolicy({ enabled: true, intervalMs: null, checkOnRelayVerified: true });
        started.push(guard.start());
        await Promise.resolve();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('check runs on a guard that was never started, and on a disabled one', async () => {
        mockIsExpired.mockReturnValue(true);

        await new RelayCredentialGuard({ intervalMs: null }).check();
        await new RelayCredentialGuard({ enabled: false, intervalMs: null }).check();

        expect(mockRequestRefresh).toHaveBeenCalledTimes(2);
    });

    it('checkOnVisible re-checks when the app returns to the foreground, and not when it leaves', async () => {
        mockIsExpired.mockReturnValue(true);
        startGuard({ intervalMs: null, checkOnVisible: true });

        visible = false;
        notifyForeground();
        await Promise.resolve();
        expect(mockRequestRefresh).not.toHaveBeenCalled();

        visible = true;
        notifyForeground();
        await Promise.resolve();
        expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
    });

    it('its stop disarms every trigger', async () => {
        jest.useFakeTimers();
        mockIsExpired.mockReturnValue(true);
        const stop = new RelayCredentialGuard({
            intervalMs: 30_000,
            checkOnVisible: true,
            checkOnRelayVerified: true,
        }).start();

        stop();
        await jest.advanceTimersByTimeAsync(60_000);
        notifyForeground();
        notifyVerified(true);

        expect(mockHasStored).not.toHaveBeenCalled();
    });
});

describe('RelayCredentialGuard — forceRefresh는 자격증명을 재고 나서 쏜다', () => {
    it('여유가 한 주기보다 많으면 쏘지 않는다 — 소유자가 알아서 갱신한다', async () => {
        mockTimeToExpiry.mockReturnValue(50 * 60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).not.toHaveBeenCalled();
    });

    it('마진 아래로 떨어졌으면 쏜다 — 소켓이 못 따라온다는 증거다', async () => {
        mockTimeToExpiry.mockReturnValue(60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('이미 지났으면 쏜다', async () => {
        mockTimeToExpiry.mockReturnValue(-1_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('측정할 수 없으면 쏜다 — 읽을 것이 없을 때는 낮게 추측하는 쪽이 안전하다', async () => {
        mockTimeToExpiry.mockReturnValue(null);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });

    it('실제로 만료된 세션은 자격증명 여유와 무관하게 갱신한다 — 그건 선제가 아니다', async () => {
        mockIsExpired.mockReturnValue(true);
        mockTimeToExpiry.mockReturnValue(50 * 60_000);

        await runCheck({ forceRefresh: true });

        expect(mockRequestRefresh).toHaveBeenCalled();
    });
});
