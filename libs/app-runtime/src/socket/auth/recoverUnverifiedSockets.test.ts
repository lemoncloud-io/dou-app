import { recoverUnverifiedSockets } from './recoverUnverifiedSockets';
import type { ISocketManager } from '../types';
import type { SocketSessionDelegate } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// The web-core barrel executes `import.meta.env` at load (transport/webTransport), which this jest
// config cannot parse — and this suite injects its own manager/delegate anyway. Stub the module the
// same way public-surface.test.ts does.
jest.mock('@chatic/web-core', () => new Proxy({}, { get: () => jest.fn() }));

/**
 * Fake per-slot client capturing the recovery sequence in `order` (prefixed by kind so the two
 * slots stay distinguishable). `authState` mirrors AuthController.state.
 */
const makeClient = (kind: string, order: string[], { authState = '', state = 'connected' } = {}) => {
    const auth = {
        state: authState,
        register: jest.fn(() => order.push(`${kind}:register`)),
        stop: jest.fn(() => order.push(`${kind}:stop`)),
    };
    return {
        auth,
        state,
        disconnect: jest.fn(() => {
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

const makeManager = (slots: Partial<Record<'relay' | 'cloud', FakeClient>>, verified: Record<string, boolean> = {}) =>
    ({
        getClient: jest.fn((kind: 'relay' | 'cloud') => slots[kind] ?? null),
        isKindVerified: jest.fn((kind: 'relay' | 'cloud') => verified[kind] ?? false),
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
        expect(relay.auth.register).not.toHaveBeenCalled();
        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
    });

    it('re-seeds a terminally-expired controller between disconnect and connect, then re-closes the gate', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        // Seed happens on the CLOSED socket (no update fired into the void), the gate is re-closed
        // so the reconnect keeps device.save:ok → auth.update order, and only then do we reconnect.
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

    it('routes the re-seeded sign callback through the delegate with the slot kind', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'expired' });
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate });

        const registeredSign = relay.auth.register.mock.calls[0][0].sign as (
            token: string,
            ctx?: { target?: string }
        ) => Promise<unknown>;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith('relay', 'sdk-token', 'uid@sid');
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

    it('continues the kick when connect rejects (reconnect controller stays armed)', async () => {
        const order: string[] = [];
        const relay = makeClient('relay', order, { authState: 'failed' });
        relay.connect.mockRejectedValue(new Error('offline'));
        const delegate = makeDelegate({ token: 'tok', authId: 'aid' });

        await expect(recoverUnverifiedSockets({ manager: makeManager({ relay }), delegate })).resolves.toBeUndefined();
    });
});
