import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { CloudCredentialGuard } from './cloudCredentialGuard';
import type { CloudCredentialPolicy } from './cloudCredentialGuard';
import { foregroundPlatform } from './foreground';

const mockTimeToExpiry = jest.fn();
const mockRenew = jest.fn();
const mockLoggerWarn = jest.fn();
/** The committed cloud, and the slots the manager has bound — what `guardedClouds` reads. */
const mockGetCommittedCloudId = jest.fn();
const mockGetSlotKeys = jest.fn();
const mockIsSlotVerified = jest.fn();

jest.mock('@chatic/session/store/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: (...args: unknown[]) => mockTimeToExpiry(...args) },
}));
jest.mock('@chatic/auth/socket/renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenew(...args),
}));
jest.mock('@chatic/transport/socket/runtime', () => ({
    getSocketManager: () => ({
        getSlotKeys: (...args: unknown[]) => mockGetSlotKeys(...args),
        isSlotVerified: (...args: unknown[]) => mockIsSlotVerified(...args),
    }),
}));
jest.mock('@chatic/session/store', () => ({
    getCommittedCloudId: (...args: unknown[]) => mockGetCommittedCloudId(...args),
}));
// The renewers reach these at module load; nothing here exercises them.
jest.mock('@chatic/auth/session/cloudSession', () => ({ cloudSession: { clearStores: jest.fn() } }));
jest.mock('@chatic/auth/session/relaySession', () => ({ relaySession: { clearAndRedirect: jest.fn() } }));
jest.mock('@chatic/session/store/stores', () => ({ cloudStore: { dropCachedCloudTokens: jest.fn() } }));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
        error: jest.fn(),
    },
}));

const MARGIN_MS = 5 * 60_000;

/** A network and a foreground the test drives. */
let online = true;
let visible = true;
let notifyForeground: () => void = () => undefined;

/** Every start a test made, stopped after it. */
const started: Array<() => void> = [];
afterEach(() => started.splice(0).forEach(stop => stop()));

/** Lets the evaluation's promises settle under fake timers. */
const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** Start a guard, let the immediate first tick settle, and hand back the guard and its stop. */
const mount = async (policy: CloudCredentialPolicy = {}) => {
    const guard = new CloudCredentialGuard({ checkOnVisible: false, ...policy });
    const stop = guard.start();
    started.push(stop);
    await flush();
    return { guard, stop };
};

beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    mockTimeToExpiry.mockReturnValue(60 * 60_000);
    mockRenew.mockResolvedValue(true);
    // One committed cloud, whose slot is bound — today's shape.
    mockGetCommittedCloudId.mockReturnValue('cloud-1');
    mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1']);
    online = true;
    visible = true;
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

afterEach(() => {
    jest.useRealTimers();
});

// The platform the link verdict reads, with a network the test drives.
beforeEach(() =>
    transportPlatform.configure(
        fakeTransportPorts({ online: { read: () => online, subscribe: () => () => undefined } })
    )
);

describe('CloudCredentialGuard — 판정', () => {
    it('여유가 충분하면 갱신하지 않는다', async () => {
        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('마진 안으로 들어오면 재발급을 부른다', async () => {
        mockTimeToExpiry.mockReturnValue(MARGIN_MS - 1);

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-1');
    });

    it('measures nothing and renews nothing when no cloud session exists', async () => {
        mockGetCommittedCloudId.mockReturnValue(null);
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID]);

        await mount();

        expect(mockTimeToExpiry).not.toHaveBeenCalled();
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('이미 만료됐어도 부른다 — 늦은 것이 안 하는 것보다 낫다', async () => {
        mockTimeToExpiry.mockReturnValue(-1_000);

        await mount();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('클라우드 세션이 없으면(측정 불가) 아무것도 하지 않는다', async () => {
        mockTimeToExpiry.mockReturnValue(null);

        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('오프라인이면 갱신하지 않는다 — 교환이 실패할 뿐이다', async () => {
        mockTimeToExpiry.mockReturnValue(0);
        online = false;

        await mount();

        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('renews when the browser is stuck offline but a socket slot is still verified', async () => {
        mockTimeToExpiry.mockReturnValue(0);
        online = false;
        mockIsSlotVerified.mockImplementation((key: string) => key === RELAY_CLOUD_ID);

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-1');
    });

    it('갱신 실패는 경고만 남기고 teardown하지 않는다 — 클라우드는 재입장으로 복구된다', async () => {
        mockTimeToExpiry.mockReturnValue(0);
        mockRenew.mockResolvedValue(false);

        await mount();

        expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('marginMs를 정책으로 받는다', async () => {
        mockTimeToExpiry.mockReturnValue(30_000);

        await mount({ marginMs: 10_000 });

        expect(mockRenew).not.toHaveBeenCalled();
    });
});

describe('CloudCredentialGuard — every cloud slot', () => {
    /** The clouds measured so far, in order (the renewer passes `now` as a second argument). */
    const measured = (): string[] => mockTimeToExpiry.mock.calls.map(call => call[0] as string);

    it('measures each cloud on its own and renews only the one whose deadline arrived', async () => {
        mockGetCommittedCloudId.mockReturnValue('cloud-1');
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? MARGIN_MS - 1 : 60 * 60_000));

        await mount();

        // cloud-2 is measured twice: once to decide, once after its renewal to re-arm the timer.
        expect(measured()).toEqual(['cloud-1', 'cloud-2', 'cloud-2']);
        expect(mockRenew).toHaveBeenCalledTimes(1);
        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });

    it('counts the committed cloud once even when its slot is bound, and never the relay slot', async () => {
        mockGetCommittedCloudId.mockReturnValue('cloud-1');
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1']);

        await mount();

        expect(measured()).toEqual(['cloud-1']);
    });

    it('arms the timer on the EARLIEST deadline among the clouds', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        // cloud-1 has an hour, cloud-2 has six minutes → the next look is in one minute, for cloud-2.
        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? 6 * 60_000 : 60 * 60_000));
        await mount();

        mockTimeToExpiry.mockImplementation((cid: string) => (cid === 'cloud-2' ? MARGIN_MS - 1 : 60 * 60_000));
        jest.advanceTimersByTime(60_000);
        await flush();

        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });

    it('a cloud whose evaluation THROWS costs only itself a retry — the others renew and the timer re-arms', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockImplementation((cid: string) => {
            if (cid === 'cloud-1') throw new Error('corrupt storage');
            return 0;
        });

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
        expect(mockRenew).not.toHaveBeenCalledWith('cloud-1');
        expect(mockLoggerWarn).toHaveBeenCalledWith('SESSION', expect.stringContaining('evaluation failed'), {
            error: expect.any(Error),
            data: { cid: 'cloud-1' },
        });

        // The failed cloud bought a retry sleep (60s), and the guard is still alive to take it.
        mockTimeToExpiry.mockImplementation(() => 60 * 60_000);
        jest.advanceTimersByTime(60_000);
        await flush();
        expect(mockTimeToExpiry.mock.calls.length).toBeGreaterThan(4);
    });

    it('one cloud’s failed renewal does not stop the next cloud from being renewed', async () => {
        mockGetSlotKeys.mockReturnValue([RELAY_CLOUD_ID, 'cloud-1', 'cloud-2']);
        mockTimeToExpiry.mockReturnValue(0);
        mockRenew.mockImplementation(async (cid: string) => cid !== 'cloud-1');

        await mount();

        expect(mockRenew).toHaveBeenCalledWith('cloud-1');
        expect(mockRenew).toHaveBeenCalledWith('cloud-2');
    });
});

describe('CloudCredentialGuard — 트리거', () => {
    it('만료 마진까지 잠들었다가 스스로 깨어난다 (폴링이 아니다)', async () => {
        // 6 minutes left, 5-minute margin → check again in 1 minute.
        mockTimeToExpiry.mockReturnValue(6 * 60_000);
        await mount();

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(1);

        mockTimeToExpiry.mockReturnValue(MARGIN_MS - 1);
        jest.advanceTimersByTime(60_000);
        await flush();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('먼 만료도 상한(5분)마다 다시 본다 — 긴 타이머는 절전 탭에서 늦게 뜬다', async () => {
        mockTimeToExpiry.mockReturnValue(60 * 60_000);
        await mount();

        jest.advanceTimersByTime(5 * 60_000);
        await flush();

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(2);
    });

    it('enabled=false면 타이머를 걸지 않는다', async () => {
        mockTimeToExpiry.mockReturnValue(0);

        await mount({ enabled: false });

        expect(mockTimeToExpiry).not.toHaveBeenCalled();
        expect(mockRenew).not.toHaveBeenCalled();
    });

    it('its stop stops the timer', async () => {
        const { stop } = await mount();
        const callsAtUnmount = mockTimeToExpiry.mock.calls.length;

        stop();
        jest.advanceTimersByTime(30 * 60_000);
        await flush();

        expect(mockTimeToExpiry).toHaveBeenCalledTimes(callsAtUnmount);
    });

    it('checkOnVisible re-checks when the app returns to the foreground, not when it leaves', async () => {
        await mount({ checkOnVisible: true });

        mockTimeToExpiry.mockReturnValue(0);
        visible = false;
        notifyForeground();
        await flush();
        expect(mockRenew).not.toHaveBeenCalled();

        visible = true;
        notifyForeground();
        await flush();
        expect(mockRenew).toHaveBeenCalled();
    });

    it('반환된 check로 호스트가 직접 트리거할 수 있다 (apps/web 포그라운드)', async () => {
        const { guard } = await mount();
        mockTimeToExpiry.mockReturnValue(0);

        await guard.check();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('reads the margin of the policy it was last given', async () => {
        mockTimeToExpiry.mockReturnValue(30_000);
        const guard = new CloudCredentialGuard({ checkOnVisible: false, marginMs: 10_000 });
        guard.setPolicy({ checkOnVisible: false, marginMs: 60_000 });

        await guard.check();

        expect(mockRenew).toHaveBeenCalled();
    });

    it('a stop while a renewal is still running arms no further timer', async () => {
        let finish: (renewed: boolean) => void = () => undefined;
        mockTimeToExpiry.mockReturnValue(0);
        mockRenew.mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)));
        const { stop } = await mount();
        const measuredBeforeStop = mockTimeToExpiry.mock.calls.length;

        stop();
        finish(true);
        await flush();
        jest.advanceTimersByTime(30 * 60_000);
        await flush();

        // One more read for the renewal that finished; no tick after it.
        expect(mockTimeToExpiry.mock.calls.length).toBe(measuredBeforeStop + 1);
    });

    it('check runs on a guard that was never started, and on a disabled one', async () => {
        mockTimeToExpiry.mockReturnValue(0);

        await new CloudCredentialGuard({ checkOnVisible: false }).check();
        await new CloudCredentialGuard({ enabled: false, checkOnVisible: false }).check();

        expect(mockRenew).toHaveBeenCalledTimes(2);
    });
});
