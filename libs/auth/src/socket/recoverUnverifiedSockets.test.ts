import { logger } from '@chatic/logger';

import {
    FIRST_CONNECT_GRACE_MS,
    RESUME_PROBE_TIMEOUT_MS,
    recoverSocketsOnResume,
    recoverUnverifiedSockets,
} from './recoverUnverifiedSockets';
import { clearResumeKick, noteResumeKick } from '@chatic/transport/socket/socketVerifyTrace';
import type { AuthIdReseedTarget } from './authIdRegistry';
import type { ISocketManager } from '@chatic/transport/socket/types';
import { RELAY_SLOT, slotKeyOf } from '@chatic/transport/socket/utils/slotKey';
import type { SocketSessionDelegate } from './types';

jest.mock('@chatic/transport/socket/socketVerifyTrace', () => ({
    noteResumeKick: jest.fn(),
    clearResumeKick: jest.fn(),
}));

const RELAY = RELAY_SLOT;
const CLOUD = slotKeyOf('cloud-1');

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@chatic/session/store/stores', () => ({
    relayStore: { getIdentityToken: () => 'relay-idt' },
    cloudStore: { getCloudTokenOf: () => ({ Token: { identityToken: 'cloud-idt' } }) },
}));
jest.mock('@chatic/session/store/credentialFreshness', () => ({
    credentialFreshness: { timeToExpiry: () => 30 * 60_000, isStale: () => false },
}));

type AuthRegisterOptions = Parameters<AuthIdReseedTarget['register']>[0];

const makeClient = (kind: string, order: string[], { authState = '', state = 'connected' } = {}) => {
    const auth = {
        state: authState,
        register: jest.fn((_opts: AuthRegisterOptions) => order.push(`${kind}:register`)),
        stop: jest.fn(() => order.push(`${kind}:stop`)),
    };
    const messageListeners = new Set<() => void>();
    return {
        auth,
        state,
        request: jest.fn((_type: string, _data: unknown, _options?: { timeoutMs?: number }) => {
            order.push(`${kind}:ping`);
            return Promise.resolve<unknown>({});
        }),
        onMessage: jest.fn((listener: () => void) => {
            messageListeners.add(listener);
            return () => messageListeners.delete(listener);
        }),
        receive: () => messageListeners.forEach(listener => listener()),
        disconnect: jest.fn((_code?: number, _reason?: string) => {
            order.push(`${kind}:disconnect`);
            return Promise.resolve();
        }),
        connect: jest.fn(() => {
            order.push(`${kind}:connect`);
            return Promise.resolve();
        }),
    };
};

type FakeClient = ReturnType<typeof makeClient>;

const makeManager = (
    slots: Partial<Record<'relay' | 'cloud', FakeClient>>,
    verified: Record<string, boolean> = {},
    active: string | null = null,
    firstConnect: Partial<Record<'relay' | 'cloud', number>> = {}
) =>
    ({
        getBoundCid: jest.fn(() => active),
        getSlotKeys: jest.fn(() => {
            const keys: string[] = [];
            if (slots.relay) keys.push(RELAY);
            if (slots.cloud) keys.push(CLOUD);
            return keys;
        }),
        getClient: jest.fn((key: string) => (key === RELAY ? (slots.relay ?? null) : (slots.cloud ?? null))),
        isSlotVerified: jest.fn((key: string) => verified[key === RELAY ? 'relay' : 'cloud'] ?? false),
        firstConnectSince: jest.fn((key: string) => firstConnect[key === RELAY ? 'relay' : 'cloud']),
    }) as unknown as ISocketManager;

const makeDelegate = (registration: { token: string; authId: string } | null): jest.Mocked<SocketSessionDelegate> =>
    ({
        getAuthRegistration: jest.fn().mockResolvedValue(registration),
        signAuth: jest.fn().mockResolvedValue({ signature: 'sig', current: 'now' }),
        commitRefreshedToken: jest.fn(),
        onAuthExpired: jest.fn(),
    }) as unknown as jest.Mocked<SocketSessionDelegate>;

describe('recoverUnverifiedSockets', () => {
    it('recycles a bound-but-unverified slot (disconnect → connect), no re-seed when not expired', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
        expect(relay.disconnect).toHaveBeenCalledWith(1000, 'wake-recovery');
        expect(relay.auth.register).not.toHaveBeenCalled();
        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
    });

    it('re-seeds a terminally-expired controller between disconnect and connect, then re-closes the gate', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        expect(order).toEqual(['relay:disconnect', 'relay:register', 'relay:stop', 'relay:connect']);
        expect(relay.auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'tok', authId: 'aid', sign: expect.any(Function) })
        );
    });

    it('still recycles an expired slot when no registration is available (seed skipped)', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate(null);

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
        expect(relay.auth.register).not.toHaveBeenCalled();
    });

    it('marks the reconnect it forces as a resume, before closing the slot', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        (noteResumeKick as jest.Mock).mockClear().mockImplementation(key => order.push(`resume:${key}`));

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate: makeDelegate(null) });

        expect(order).toEqual([`resume:${RELAY}`, 'relay:disconnect', 'relay:connect']);
        expect(clearResumeKick).toHaveBeenCalledWith(RELAY);
    });

    it('skips verified slots and unbound slots', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({
            manager: makeManager({ relay }, { relay: true }),
            delegate,
        });

        expect(order).toEqual([]);
        expect(relay.disconnect).not.toHaveBeenCalled();
        expect(relay.request).not.toHaveBeenCalled();
    });

    it('kicks each unverified slot independently (relay wedged while cloud healthy)', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        const cloud = makeClient('cloud', order);
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({
            manager: makeManager({ relay, cloud }, { relay: false, cloud: true }),
            delegate,
        });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
        expect(cloud.disconnect).not.toHaveBeenCalled();
    });

    it("leaves a slot's first connect that began moments ago to finish, and says so", async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connecting' });
        const now = () => 50_000;
        (logger.info as jest.Mock).mockClear();

        await recoverUnverifiedSockets({
            manager: makeManager({ relay }, {}, null, { relay: now() - 300 }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith(
            'SOCKET',
            '[recoverUnverifiedSockets] leaving a first connect',
            expect.objectContaining({ data: expect.objectContaining({ kind: 'relay', firstConnectAgeMs: 300 }) })
        );
    });

    it('leaves a slot that is bound but has not begun to connect: its boot is still on the way', async () => {
        const order: string[] = [];
        const cloud = makeClient('cloud', order, { state: 'idle' });

        await recoverUnverifiedSockets({ manager: makeManager({ cloud }), delegate: makeDelegate(null) });

        expect(order).toEqual([]);
    });

    it('kicks a first connect that has run for the grace or longer, as a stalled or stranded one', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connected' });
        const now = () => 500_000;

        await recoverUnverifiedSockets({
            manager: makeManager({ relay }, {}, null, { relay: now() - FIRST_CONNECT_GRACE_MS }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
    });

    it('kicks a reconnect however young, so it restarts at once with the backoff reset', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connecting' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate: makeDelegate(null) });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
    });

    it('kicks a terminally expired controller however young its first connect is', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const now = () => 50_000;

        await recoverUnverifiedSockets({
            manager: makeManager({ relay }, {}, null, { relay: now() - 100 }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
    });

    it('kicks when the clock has moved back past the first connect, which says nothing about its age', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connecting' });
        const now = () => 50_000;

        await recoverUnverifiedSockets({
            manager: makeManager({ relay }, {}, null, { relay: now() + 60_000 }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
    });

    it('spares only the slot on its first connect when another one is stranded', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connecting' });
        const cloud = makeClient('cloud', order, { state: 'closed' });
        const now = () => 50_000;

        await recoverUnverifiedSockets({
            manager: makeManager({ relay, cloud }, {}, null, { relay: now() - 1_000 }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual(['cloud:disconnect', 'cloud:connect']);
    });

    it('routes the re-seeded sign callback through the delegate with the slot key', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        const registeredSign = relay.auth.register.mock.calls[0][0].sign;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith(RELAY, 'sdk-token', 'uid@sid');
    });

    it('kicks the active slot first, whatever order the slots were bound in', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        const cloud = makeClient('cloud', order, { authState: 'failed' });

        await recoverUnverifiedSockets({
            manager: makeManager({ relay, cloud }, { relay: false, cloud: false }, CLOUD),
            delegate: makeDelegate(null),
        });

        expect(order).toEqual(['cloud:disconnect', 'cloud:connect', 'relay:disconnect', 'relay:connect']);
    });

    it('coalesces concurrent calls onto the in-flight run', async () => {
        const order: string[] = [];
        let releaseDisconnect: () => void = () => undefined;
        const relay = makeClient('relay', order, { authState: 'failed' });
        relay.disconnect.mockImplementation(() => {
            order.push('relay:disconnect');
            return new Promise<void>(resolve => {
                releaseDisconnect = resolve;
            });
        });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });
        const manager = makeManager({ relay });

        const first = recoverUnverifiedSockets({ manager, delegate });
        const second = recoverUnverifiedSockets({ manager, delegate });
        releaseDisconnect();
        await Promise.all([first, second]);

        expect(relay.disconnect).toHaveBeenCalledTimes(1);
        expect(relay.connect).toHaveBeenCalledTimes(1);
    });

    it('still reconnects when re-seeding an expired slot fails, so the slot is not left closed', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate(null);
        delegate.getAuthRegistration.mockRejectedValue(new Error('storage unavailable'));

        await expect(recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate })).resolves.toBeUndefined();

        expect(order).toEqual(['relay:disconnect', 'relay:connect']);
        expect(clearResumeKick).toHaveBeenCalledWith(RELAY);
    });

    it('continues the kick when connect rejects (reconnect controller stays armed)', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        relay.connect.mockRejectedValue(new Error('offline'));
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await expect(recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate })).resolves.toBeUndefined();
    });
});

describe('recoverSocketsOnResume', () => {
    const timeout = () => Promise.reject(new Error(`408 REQUEST TIMEOUT - system.ping[m-1]`));

    it('pings each verified slot once, with the probe timeout, and leaves one that answers alone', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        const cloud = makeClient('cloud', order);

        await recoverSocketsOnResume({
            manager: makeManager({ relay, cloud }, { relay: true, cloud: true }),
            delegate: makeDelegate(null),
        });

        expect(order).toEqual(['relay:ping', 'cloud:ping']);
        expect(relay.request).toHaveBeenCalledWith('system.ping', null, { timeoutMs: RESUME_PROBE_TIMEOUT_MS });
        expect(relay.disconnect).not.toHaveBeenCalled();
        expect(cloud.disconnect).not.toHaveBeenCalled();
    });

    it("leaves a slot's first connect alone too: neither kicked nor pinged", async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { state: 'connecting' });
        const cloud = makeClient('cloud', order);
        const now = () => 50_000;

        await recoverSocketsOnResume({
            manager: makeManager({ relay, cloud }, { cloud: true }, null, { relay: now() - 500 }),
            delegate: makeDelegate(null),
            now,
        });

        expect(order).toEqual(['cloud:ping']);
        expect(relay.request).not.toHaveBeenCalled();
    });

    it('logs every probe of the pass on one line, answered ones included', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        const cloud = makeClient('cloud', order);
        cloud.request.mockImplementation(timeout);
        (logger.info as jest.Mock).mockClear();

        await recoverSocketsOnResume({
            manager: makeManager({ relay, cloud }, { relay: true, cloud: true }),
            delegate: makeDelegate(null),
        });

        const probed = (logger.info as jest.Mock).mock.calls.filter(
            ([, message]) => message === '[recoverUnverifiedSockets] probed'
        );
        expect(probed).toHaveLength(1);
        expect(probed[0][2].data.probes).toEqual([
            { kind: 'relay', cid: RELAY, outcome: 'answered', rttMs: expect.any(Number) },
            { kind: 'cloud', cid: CLOUD, outcome: 'recycled', rttMs: expect.any(Number) },
        ]);
    });

    it('recycles a verified slot that does not answer, as a resume with its own close reason', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        relay.request.mockImplementation(() => {
            order.push('relay:ping');
            return timeout();
        });
        (noteResumeKick as jest.Mock).mockClear().mockImplementation(key => order.push(`resume:${key}`));

        await recoverSocketsOnResume({
            manager: makeManager({ relay }, { relay: true }),
            delegate: makeDelegate(null),
        });

        expect(order).toEqual(['relay:ping', `resume:${RELAY}`, 'relay:disconnect', 'relay:connect']);
        expect(relay.disconnect).toHaveBeenCalledWith(1000, 'wake-probe');
        expect(clearResumeKick).toHaveBeenCalledWith(RELAY);
        expect(relay.auth.register).not.toHaveBeenCalled();
    });

    it('keeps a slot that delivered any frame while the ping waited', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        relay.request.mockImplementation(() => {
            relay.receive();
            return timeout();
        });

        await recoverSocketsOnResume({
            manager: makeManager({ relay }, { relay: true }),
            delegate: makeDelegate(null),
        });

        expect(relay.disconnect).not.toHaveBeenCalled();
    });

    it('leaves a slot whose socket closed under the ping to its reconnect controller', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        relay.request.mockRejectedValue(new Error('499 CLIENT CLOSED REQUEST - socket closed'));

        await recoverSocketsOnResume({
            manager: makeManager({ relay }, { relay: true }),
            delegate: makeDelegate(null),
        });

        expect(relay.disconnect).not.toHaveBeenCalled();
    });

    it('does not recycle a slot that was rebuilt or stopped reading connected while the ping waited', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        const cloud = makeClient('cloud', order);
        const manager = makeManager({ relay, cloud }, { relay: true, cloud: true });
        const rebuilt = makeClient('relay-rebuilt', order);
        relay.request.mockImplementation(() => {
            (manager.getClient as jest.Mock).mockImplementation((key: string) => (key === RELAY ? rebuilt : cloud));
            return timeout();
        });
        cloud.request.mockImplementation(() => {
            cloud.state = 'closed';
            return timeout();
        });

        await recoverSocketsOnResume({ manager, delegate: makeDelegate(null) });

        expect(relay.disconnect).not.toHaveBeenCalled();
        expect(rebuilt.disconnect).not.toHaveBeenCalled();
        expect(cloud.disconnect).not.toHaveBeenCalled();
    });

    it('kicks unverified slots and probes verified ones in the same pass, without waiting on the probes', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        const cloud = makeClient('cloud', order);
        let answerPing: () => void = () => undefined;
        cloud.request.mockImplementation(() => {
            order.push('cloud:ping');
            return new Promise(resolve => (answerPing = () => resolve({})));
        });

        const pass = recoverSocketsOnResume({
            manager: makeManager({ relay, cloud }, { relay: false, cloud: true }),
            delegate: makeDelegate(null),
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(order).toEqual(['cloud:ping', 'relay:disconnect', 'relay:connect']);

        answerPing();
        await pass;
        expect(cloud.disconnect).not.toHaveBeenCalled();
    });

    it('shares one pass with concurrent callers, so a slot is pinged once', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order);
        const manager = makeManager({ relay }, { relay: true });

        await Promise.all([
            recoverSocketsOnResume({ manager, delegate: makeDelegate(null) }),
            recoverSocketsOnResume({ manager, delegate: makeDelegate(null) }),
        ]);

        expect(relay.request).toHaveBeenCalledTimes(1);
    });
});
