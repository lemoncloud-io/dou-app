import { bootstrapSocketConnection } from './bootstrapSocketConnection';
import type { ISocketManager, SocketBindingConfig, SocketSessionDelegate } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CONFIG: SocketBindingConfig = { url: 'wss://example.test/socket', deviceId: 'device-1', wssType: 'relay' };

/** Fake AuthController capturing the subscribed listeners so tests can drive state transitions. */
const makeAuth = () => {
    const authStateListeners: Array<(state: string) => void> = [];
    const tokenListeners: Array<(view: unknown) => void> = [];
    const unsubAuthState = jest.fn();
    const unsubToken = jest.fn();
    return {
        register: jest.fn(),
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

const makeManager = (auth: unknown, order: string[]) => {
    const client = { auth };
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
    it('registers BEFORE connect (ordering invariant §6-1)', async () => {
        const order: string[] = [];
        const auth = makeAuth();
        auth.register.mockImplementation(() => order.push('register'));
        const manager = makeManager(auth, order);

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });

        expect(order).toEqual(['register', 'connect']);
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'tok', authId: 'aid', sign: expect.any(Function) })
        );
    });

    it('mirrors auth state into setAuthenticated and runs onAuthExpired on the terminal state', async () => {
        const auth = makeAuth();
        const manager = makeManager(auth, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

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
        const auth = makeAuth();
        const manager = makeManager(auth, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        const view = { Token: { identityToken: 'fresh' } };
        auth.emitTokenRefresh(view);
        expect(delegate.commitRefreshedToken).toHaveBeenCalledWith('relay', view);
    });

    it('routes the SDK sign callback to delegate.signAuth with the switch target', async () => {
        const auth = makeAuth();
        const manager = makeManager(auth, []);
        const delegate = makeDelegate();

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        const registeredSign = auth.register.mock.calls[0][0].sign as (
            token: string,
            ctx?: { target?: string }
        ) => Promise<unknown>;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith('relay', 'sdk-token', 'uid@sid');
    });

    it('returns a cleanup that detaches both subscriptions', async () => {
        const auth = makeAuth();
        const manager = makeManager(auth, []);

        const cleanup = await bootstrapSocketConnection({ manager, config: CONFIG, delegate: makeDelegate() });
        cleanup();

        expect(auth.unsubAuthState).toHaveBeenCalledTimes(1);
        expect(auth.unsubToken).toHaveBeenCalledTimes(1);
    });

    it('skips register when no registration is available but still connects', async () => {
        const order: string[] = [];
        const auth = makeAuth();
        auth.register.mockImplementation(() => order.push('register'));
        const manager = makeManager(auth, order);
        const delegate = makeDelegate({ getAuthRegistration: jest.fn().mockResolvedValue(null) });

        await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        expect(auth.register).not.toHaveBeenCalled();
        expect(order).toEqual(['connect']);
    });

    it('connects without wiring when the client has no AuthController (defensive)', async () => {
        const order: string[] = [];
        const manager = makeManager(undefined, order);
        const delegate = makeDelegate();

        const cleanup = await bootstrapSocketConnection({ manager, config: CONFIG, delegate });

        expect(order).toEqual(['connect']);
        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
        expect(() => cleanup()).not.toThrow();
    });
});
