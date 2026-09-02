import { bootstrapSocketConnection } from './bootstrapSocketConnection';
import type { ISocketManager, SocketBindingConfig } from '../types';
import type { SocketSessionDelegate } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-1', wssType: 'relay' };

/**
 * Fake AuthController capturing the subscribed listeners so tests can drive state transitions, plus
 * the impl-only `start`/`stop` activation gate the bootstrap toggles. Calls are appended to `order`
 * so tests can assert the seed→gate→fire sequence.
 */
const makeAuth = (order: string[]) => {
    const authStateListeners: Array<(state: string) => void> = [];
    const tokenListeners: Array<(view: unknown) => void> = [];
    const unsubAuthState = jest.fn();
    const unsubToken = jest.fn();
    return {
        // Mirrors AuthController.state; tests set it to drive the expired-resume throttle.
        state: '',
        register: jest.fn(() => order.push('register')),
        start: jest.fn(() => order.push('start')),
        stop: jest.fn(() => order.push('stop')),
        onAuthState: jest.fn((listener: (state: string) => void) => {
            authStateListeners.push(listener);
            return unsubAuthState;
        }),
        onTokenRefresh: jest.fn((listener: (view: unknown) => void) => {
            tokenListeners.push(listener);
            return unsubToken;
        }),
        emitAuthState: (state: string) => authStateListeners.forEach(l => l(state)),
        emitTokenRefresh: (view: unknown) => tokenListeners.forEach(l => l(view)),
        unsubAuthState,
        unsubToken,
    };
};

/**
 * Fake ClientSocketV2 exposing the `onMessage`/`onState` subscriptions the bootstrap wires the gate
 * to. `device.save:ok` arrives via `onMessage` (it is a request reply, so the SDK does NOT route it
 * to `onType`), so the gate listens on `onMessage` and filters by `message.type`.
 */
const makeClient = (auth: unknown) => {
    const messageListeners: Array<(event: { message: { type: string } }) => void> = [];
    const stateListeners: Array<(event: { next: string }) => void> = [];
    const unsubMessage = jest.fn();
    const unsubState = jest.fn();
    return {
        auth,
        onMessage: jest.fn((listener: (event: { message: { type: string } }) => void) => {
            messageListeners.push(listener);
            return unsubMessage;
        }),
        onState: jest.fn((listener: (event: { next: string }) => void) => {
            stateListeners.push(listener);
            return unsubState;
        }),
        emitMessage: (type: string) => messageListeners.forEach(l => l({ message: { type } })),
        emitState: (next: string) => stateListeners.forEach(l => l({ next })),
        unsubMessage,
        unsubState,
    };
};

const makeManager = (client: unknown, order: string[]) => {
    const manager: Partial<ISocketManager> = {
        ensure: jest.fn(() => client as never),
        connect: jest.fn(() => {
            order.push('connect');
            return Promise.resolve();
        }),
        setAuthenticated: jest.fn(),
    };
    return manager as ISocketManager;
};

const makeDelegate = (overrides: Partial<SocketSessionDelegate> = {}): jest.Mocked<SocketSessionDelegate> =>
    ({
        getAuthRegistration: jest.fn().mockResolvedValue({ token: 'tok', authId: 'aid' }),
        signAuth: jest.fn().mockResolvedValue({ signature: 'sig', current: 'now' }),
        commitRefreshedToken: jest.fn(),
        onAuthExpired: jest.fn(),
        ...overrides,
    }) as unknown as jest.Mocked<SocketSessionDelegate>;

describe('bootstrapSocketConnection', () => {
    it('seeds the token and closes the gate before connect, without auto-firing auth.update', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

        // register seeds the token, stop() deactivates so the SDK's connect handler cannot auto-send,
        // and only then do we connect. No start() (no auth.update) until device.save:ok arrives.
        expect(order).toEqual(['register', 'stop', 'connect']);
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'tok', authId: 'aid', sign: expect.any(Function) })
        );
        expect(auth.start).not.toHaveBeenCalled();
    });

    it('fires auth.update (start) only after device.save:ok', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });
        expect(auth.start).not.toHaveBeenCalled();

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(1);
        // Full order: seed → gate closed → connect → device registered → gate opened (auth.update).
        expect(order).toEqual(['register', 'stop', 'connect', 'start']);
    });

    it('does not open the gate on device.save:error or unrelated messages', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

        client.emitMessage('device.save:error');
        client.emitMessage('auth.update:ok');
        client.emitMessage('chat.read:ok');
        expect(auth.start).not.toHaveBeenCalled();
    });

    it('re-closes the gate on disconnect and reopens on the reconnect device.save:ok', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(1);

        // A drop re-closes the gate so the reconnect holds device.save → auth.update order.
        client.emitState('closed');
        expect(auth.stop).toHaveBeenCalledTimes(2); // setup + this disconnect

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(2);
    });

    it('re-closes the gate on closing and idle transitions too (not on connected)', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });
        expect(auth.stop).toHaveBeenCalledTimes(1); // setup

        client.emitState('connected');
        expect(auth.stop).toHaveBeenCalledTimes(1); // connected must NOT re-close the gate

        client.emitState('closing');
        client.emitState('idle');
        expect(auth.stop).toHaveBeenCalledTimes(3);
    });

    it('mirrors auth state into setAuthenticated and runs onAuthExpired on the terminal state', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        auth.emitAuthState('authenticated');
        expect(manager.setAuthenticated).toHaveBeenCalledWith('relay', true);

        auth.emitAuthState('failed');
        expect(manager.setAuthenticated).toHaveBeenCalledWith('relay', false);
        expect(delegate.onAuthExpired).not.toHaveBeenCalled();

        auth.emitAuthState('expired');
        expect(manager.setAuthenticated).toHaveBeenCalledWith('relay', false);
        expect(delegate.onAuthExpired).toHaveBeenCalledTimes(1);
        expect(delegate.onAuthExpired).toHaveBeenCalledWith('relay');
    });

    it('writes refreshed tokens back through the delegate', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        const view = { Token: { identityToken: 'fresh' } };
        auth.emitTokenRefresh(view);
        expect(delegate.commitRefreshedToken).toHaveBeenCalledWith('relay', view);
    });

    // The writeback is the step that re-mints the signing material, and it runs AFTER
    // requestRelaySessionRefresh has already reported success (this emission is what resolves it). A
    // rejection here used to be an unhandled promise: caller thinks fresh, every signed request 403s.
    it('writeback이 거부돼도 삼키지 않고 에러로 남긴다', async () => {
        const { logger } = jest.requireMock('@chatic/bridges') as { logger: { error: jest.Mock } };
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const failure = new Error('.AccessKeyId (string) is required!');
        const delegate = makeDelegate({ commitRefreshedToken: jest.fn().mockRejectedValue(failure) });

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        auth.emitTokenRefresh({ Token: {} });
        // The catch is attached to the returned promise, so let the rejection settle.
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[bootstrapSocketConnection] token writeback failed',
            expect.objectContaining({ error: failure, data: { kind: 'relay' } })
        );
    });

    it('writeback이 동기 함수여도(Promise가 아니어도) 그대로 동작한다', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate({ commitRefreshedToken: jest.fn(() => undefined) });

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        expect(() => auth.emitTokenRefresh({ Token: {} })).not.toThrow();
        expect(delegate.commitRefreshedToken).toHaveBeenCalled();
    });

    it('routes the SDK sign callback to delegate.signAuth with the switch target', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        const registeredSign = auth.register.mock.calls[0][0].sign as (
            token: string,
            ctx?: { target?: string }
        ) => Promise<unknown>;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith('relay', 'sdk-token', 'uid@sid');
    });

    it('returns a cleanup that detaches every subscription', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        const cleanup = await bootstrapSocketConnection({
            manager,
            kind: 'relay',
            config: CONFIG,
            delegate: makeDelegate(),
        });
        cleanup();

        expect(auth.unsubAuthState).toHaveBeenCalledTimes(1);
        expect(auth.unsubToken).toHaveBeenCalledTimes(1);
        expect(client.unsubMessage).toHaveBeenCalledTimes(1);
        expect(client.unsubState).toHaveBeenCalledTimes(1);
    });

    it('skips register and gate wiring when no registration is available but still connects', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);
        const delegate = makeDelegate({ getAuthRegistration: jest.fn().mockResolvedValue(null) });

        await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        expect(auth.register).not.toHaveBeenCalled();
        expect(auth.stop).not.toHaveBeenCalled();
        expect(client.onMessage).not.toHaveBeenCalled();
        expect(client.onState).not.toHaveBeenCalled();
        expect(order).toEqual(['connect']);
    });

    describe('terminal-expired resume throttle', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('resumes an expired controller on the first device.save:ok, then holds within the cooldown', async () => {
            const auth = makeAuth([]);
            const client = makeClient(auth);
            const manager = makeManager(client, []);
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

            await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

            auth.state = 'expired';
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(1); // first resume is immediate

            // Reconnect churn within the 30s cooldown: the gate stays closed (no auth.update spam).
            nowSpy.mockReturnValue(1_000_000 + 10_000);
            client.emitMessage('device.save:ok');
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(1);

            // Past the cooldown the next resume runs (and the cooldown doubles behind it).
            nowSpy.mockReturnValue(1_000_000 + 31_000);
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);

            // The doubled (60s) cooldown now applies: 31s later is still inside it.
            nowSpy.mockReturnValue(1_000_000 + 62_000);
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);
        });

        it('resets the resume budget once the controller authenticates again', async () => {
            const auth = makeAuth([]);
            const client = makeClient(auth);
            const manager = makeManager(client, []);
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

            await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

            auth.state = 'expired';
            client.emitMessage('device.save:ok'); // consumes the immediate resume
            expect(auth.start).toHaveBeenCalledTimes(1);

            // Recovery: the SDK re-authenticates → budget resets to "immediate".
            auth.state = 'authenticated';
            auth.emitAuthState('authenticated');

            auth.state = 'expired';
            nowSpy.mockReturnValue(1_000_001); // 1ms later — would be inside the old cooldown
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);
        });

        it('never throttles a healthy (non-expired) controller', async () => {
            const auth = makeAuth([]);
            const client = makeClient(auth);
            const manager = makeManager(client, []);
            jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

            await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate: makeDelegate() });

            auth.state = 'pending';
            client.emitMessage('device.save:ok');
            client.emitState('closed');
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2); // same-instant reconnects both start
        });
    });

    it('connects without wiring when the client has no AuthController (defensive)', async () => {
        const order: string[] = [];
        const client = makeClient(undefined);
        const manager = makeManager(client, order);
        const delegate = makeDelegate();

        const cleanup = await bootstrapSocketConnection({ manager, kind: 'relay', config: CONFIG, delegate });

        expect(order).toEqual(['connect']);
        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
        expect(() => cleanup()).not.toThrow();
    });
});
