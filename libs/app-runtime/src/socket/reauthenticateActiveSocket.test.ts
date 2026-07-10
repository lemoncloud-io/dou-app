import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import type { ISocketManager, SocketSessionDelegate } from './types';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const makeAuth = (token: string, order: string[]) => ({
    token,
    logout: jest.fn(() => {
        order.push('logout');
        return Promise.resolve();
    }),
    register: jest.fn(() => {
        order.push('register');
    }),
});

const makeManager = (auth: unknown): ISocketManager =>
    ({ getClient: jest.fn(() => (auth ? { auth } : null)) }) as unknown as ISocketManager;

const makeDelegate = (registration: { token: string; authId: string } | null): jest.Mocked<SocketSessionDelegate> =>
    ({
        getAuthRegistration: jest.fn().mockResolvedValue(registration),
        signAuth: jest.fn().mockResolvedValue({ signature: 'sig', current: 'now' }),
        commitRefreshedToken: jest.fn(),
        onAuthExpired: jest.fn(),
    }) as unknown as jest.Mocked<SocketSessionDelegate>;

describe('reauthenticateActiveSocket', () => {
    it('logs out then re-registers when the registration token differs from the SDK token', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate });

        expect(order).toEqual(['logout', 'register']); // revoke old session BEFORE registering new identity
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'social-token', authId: 'social-auth', sign: expect.any(Function) })
        );
    });

    it('is a no-op when the registration token already matches the SDK token (SDK writeback guard)', async () => {
        const order: string[] = [];
        const auth = makeAuth('same-token', order);
        const delegate = makeDelegate({ token: 'same-token', authId: 'auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate });

        expect(order).toEqual([]);
        expect(auth.logout).not.toHaveBeenCalled();
        expect(auth.register).not.toHaveBeenCalled();
    });

    it('does nothing when there is no active client', async () => {
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(null), delegate });

        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
    });

    it('does nothing (no logout) when no registration is available', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate(null);

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate });

        expect(order).toEqual([]);
        expect(auth.logout).not.toHaveBeenCalled();
    });

    it('routes the registered sign callback to delegate.signAuth with the switch target', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate });

        const registeredSign = auth.register.mock.calls[0][0].sign as (
            token: string,
            ctx?: { target?: string }
        ) => Promise<unknown>;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith('sdk-token', 'uid@sid');
    });
});
