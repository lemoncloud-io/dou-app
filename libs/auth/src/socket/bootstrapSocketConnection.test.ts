import { authIdRegistry } from './authIdRegistry';
import type { AuthIdReseedTarget } from './authIdRegistry';
import { bootstrapSocketConnection } from './bootstrapSocketConnection';
import { observeSocketVerify } from '@chatic/transport/socket/socketVerifyTrace';
import type { ISocketManager, SocketBindingConfig } from '@chatic/transport/socket/types';
import { RELAY_SLOT } from '@chatic/transport/socket/utils/slotKey';
import type { SocketSessionDelegate } from './types';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const stopObservingVerify = jest.fn();
jest.mock('@chatic/transport/socket/socketVerifyTrace', () => ({
    observeSocketVerify: jest.fn(() => stopObservingVerify),
}));

const RELAY = RELAY_SLOT;

const CONFIG: SocketBindingConfig = {
    url: 'wss://example.test/socket',
    deviceId: 'device-1',
    wssType: 'relay',
    cid: 'default',
};

type AuthRegisterOptions = Parameters<AuthIdReseedTarget['register']>[0];

const makeAuth = (order: string[]) => {
    const authStateListeners: Array<(state: string) => void> = [];
    const tokenListeners: Array<(view: unknown) => void> = [];
    const unsubAuthState = jest.fn();
    const unsubToken = jest.fn();
    return {
        state: '',
        register: jest.fn((_opts: AuthRegisterOptions) => order.push('register')),
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

const makeClient = (auth: unknown, state = 'connected') => {
    const messageListeners: Array<(event: { message: { type: string } }) => void> = [];
    const stateListeners: Array<(event: { next: string }) => void> = [];
    const unsubMessage = jest.fn();
    const unsubState = jest.fn();
    return {
        auth,
        state,
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

const flush = async (): Promise<void> => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

describe('bootstrapSocketConnection', () => {
    beforeEach(() => authIdRegistry.reset());

    it('seeds the token and closes the gate before connect, without auto-firing auth.update', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

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

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });
        expect(auth.start).not.toHaveBeenCalled();

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(1);
        expect(order).toEqual(['register', 'stop', 'connect', 'start']);
    });

    it('does not open the gate on device.save:error or unrelated messages', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

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

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(1);

        client.emitState('closed');
        expect(auth.stop).toHaveBeenCalledTimes(2);

        client.emitMessage('device.save:ok');
        expect(auth.start).toHaveBeenCalledTimes(2);
    });

    it('re-closes the gate on closing and idle transitions too (not on connected)', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });
        expect(auth.stop).toHaveBeenCalledTimes(1);

        client.emitState('connected');
        expect(auth.stop).toHaveBeenCalledTimes(1);

        client.emitState('closing');
        client.emitState('idle');
        expect(auth.stop).toHaveBeenCalledTimes(3);
    });

    it('mirrors auth state into setAuthenticated and runs onAuthExpired on the terminal state', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        auth.emitAuthState('authenticated');
        expect(manager.setAuthenticated).toHaveBeenCalledWith(RELAY, true);

        auth.emitAuthState('failed');
        expect(manager.setAuthenticated).toHaveBeenCalledWith(RELAY, false);
        expect(delegate.onAuthExpired).not.toHaveBeenCalled();

        auth.emitAuthState('expired');
        expect(manager.setAuthenticated).toHaveBeenCalledWith(RELAY, false);
        expect(delegate.onAuthExpired).toHaveBeenCalledTimes(1);
        expect(delegate.onAuthExpired).toHaveBeenCalledWith(RELAY);
    });

    it('tells the delegate each time the slot authenticates, and only then', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate({ onAuthenticated: jest.fn() });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        auth.emitAuthState('pending');
        auth.emitAuthState('failed');
        expect(delegate.onAuthenticated).not.toHaveBeenCalled();

        auth.emitAuthState('authenticated');
        auth.emitAuthState('authenticated');
        expect(delegate.onAuthenticated).toHaveBeenCalledTimes(2);
        expect(delegate.onAuthenticated).toHaveBeenCalledWith(RELAY);
    });

    it('writes refreshed tokens back through the delegate', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        const view = { Token: { identityToken: 'fresh' } };
        auth.emitTokenRefresh(view);
        expect(delegate.commitRefreshedToken).toHaveBeenCalledWith(RELAY, view);
    });

    it('writeback이 거부돼도 삼키지 않고 에러로 남긴다', async () => {
        const { logger } = jest.requireMock('@chatic/logger') as { logger: { error: jest.Mock } };
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const failure = new Error('.AccessKeyId (string) is required!');
        const delegate = makeDelegate({ commitRefreshedToken: jest.fn().mockRejectedValue(failure) });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        auth.emitTokenRefresh({ Token: {} });
        await Promise.resolve();
        await Promise.resolve();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[bootstrapSocketConnection] token writeback failed',
            expect.objectContaining({ error: failure, data: { kind: 'relay', cid: RELAY } })
        );
    });

    it('writeback이 동기 함수여도(Promise가 아니어도) 그대로 동작한다', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate({ commitRefreshedToken: jest.fn(() => undefined) });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        expect(() => auth.emitTokenRefresh({ Token: {} })).not.toThrow();
        expect(delegate.commitRefreshedToken).toHaveBeenCalled();
    });

    it('re-registers the controller when the writeback rotated the store authId', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();
        (delegate.getAuthRegistration as jest.Mock)
            .mockResolvedValueOnce({ token: 'tok', authId: 'aid' })
            .mockResolvedValueOnce({ token: 'tok-2', authId: 'rotated-aid' });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });
        auth.emitTokenRefresh({ Token: {} });
        await flush();

        expect(auth.register).toHaveBeenCalledTimes(2);
        expect(auth.register).toHaveBeenLastCalledWith(
            expect.objectContaining({ token: 'tok-2', authId: 'rotated-aid' })
        );
        expect(authIdRegistry.get(RELAY)).toBe('rotated-aid');
        expect(auth.stop).toHaveBeenCalledTimes(1);
    });

    it('leaves the controller alone when the writeback kept the same authId', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });
        auth.emitTokenRefresh({ Token: {} });
        await flush();

        expect(auth.register).toHaveBeenCalledTimes(1);
    });

    it('skips the authId re-sync when the writeback itself failed', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate({
            commitRefreshedToken: jest.fn().mockRejectedValue(new Error('commit failed')),
        });
        (delegate.getAuthRegistration as jest.Mock)
            .mockResolvedValueOnce({ token: 'tok', authId: 'aid' })
            .mockResolvedValueOnce({ token: 'tok-2', authId: 'rotated-aid' });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });
        auth.emitTokenRefresh({ Token: {} });
        await flush();

        expect(auth.register).toHaveBeenCalledTimes(1);
        expect(authIdRegistry.get(RELAY)).toBe('aid');
    });

    it('re-closes the gate when the re-sync registers on a DISCONNECTED socket', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth, 'closed');
        const manager = makeManager(client, []);
        const delegate = makeDelegate();
        (delegate.getAuthRegistration as jest.Mock)
            .mockResolvedValueOnce({ token: 'tok', authId: 'aid' })
            .mockResolvedValueOnce({ token: 'tok-2', authId: 'rotated-aid' });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });
        auth.emitTokenRefresh({ Token: {} });
        await flush();

        expect(auth.stop).toHaveBeenCalledTimes(2);
    });

    it('routes the SDK sign callback to delegate.signAuth with the switch target', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        const registeredSign = auth.register.mock.calls[0][0].sign;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith(RELAY, 'sdk-token', 'uid@sid');
    });

    it('returns a cleanup that detaches every subscription', async () => {
        const auth = makeAuth([]);
        const client = makeClient(auth);
        const manager = makeManager(client, []);

        const cleanup = await bootstrapSocketConnection({
            manager,
            config: CONFIG,
            delegate: makeDelegate(),
        });
        cleanup();

        expect(auth.unsubAuthState).toHaveBeenCalledTimes(1);
        expect(auth.unsubToken).toHaveBeenCalledTimes(1);
        expect(client.unsubMessage).toHaveBeenCalledTimes(1);
        expect(client.unsubState).toHaveBeenCalledTimes(1);
    });

    it('times the slot connections from before the first connect, and stops on cleanup', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);
        stopObservingVerify.mockClear();
        (observeSocketVerify as jest.Mock).mockImplementationOnce(() => {
            order.push('observe');
            return stopObservingVerify;
        });

        const cleanup = await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });
        cleanup();

        expect(observeSocketVerify).toHaveBeenCalledWith({ key: RELAY, client, auth });
        expect(order.indexOf('observe')).toBeLessThan(order.indexOf('connect'));
        expect(stopObservingVerify).toHaveBeenCalledTimes(1);
    });

    it('skips register and gate wiring when no registration is available but still connects', async () => {
        const order: string[] = [];
        const auth = makeAuth(order);
        const client = makeClient(auth);
        const manager = makeManager(client, order);
        const delegate = makeDelegate({ getAuthRegistration: jest.fn().mockResolvedValue(null) });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

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

            await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

            auth.state = 'expired';
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(1);

            nowSpy.mockReturnValue(1_000_000 + 10_000);
            client.emitMessage('device.save:ok');
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(1);

            nowSpy.mockReturnValue(1_000_000 + 31_000);
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);

            nowSpy.mockReturnValue(1_000_000 + 62_000);
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);
        });

        it('resets the resume budget once the controller authenticates again', async () => {
            const auth = makeAuth([]);
            const client = makeClient(auth);
            const manager = makeManager(client, []);
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

            await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

            auth.state = 'expired';
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(1);

            auth.state = 'authenticated';
            auth.emitAuthState('authenticated');

            auth.state = 'expired';
            nowSpy.mockReturnValue(1_000_001);
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);
        });

        it('never throttles a healthy (non-expired) controller', async () => {
            const auth = makeAuth([]);
            const client = makeClient(auth);
            const manager = makeManager(client, []);
            jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

            await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

            auth.state = 'pending';
            client.emitMessage('device.save:ok');
            client.emitState('closed');
            client.emitMessage('device.save:ok');
            expect(auth.start).toHaveBeenCalledTimes(2);
        });
    });

    it('connects without wiring when the client has no AuthController (defensive)', async () => {
        const order: string[] = [];
        const client = makeClient(undefined);
        const manager = makeManager(client, order);
        const delegate = makeDelegate();

        const cleanup = await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        expect(order).toEqual(['connect']);
        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
        expect(() => cleanup()).not.toThrow();
    });
});
