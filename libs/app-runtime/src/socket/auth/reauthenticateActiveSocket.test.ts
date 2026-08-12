import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import type { ISocketManager } from '../types';
import type { SocketSessionDelegate } from './types';

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
    stop: jest.fn(() => {
        order.push('stop');
    }),
});

const makeManager = (auth: unknown, isVerified = true, clientState = 'connected'): ISocketManager =>
    ({
        getClient: jest.fn(() => (auth ? { auth, state: clientState } : null)),
        getSnapshot: jest.fn(() => ({ isVerified })),
        // The revoke/dip guard now reads the PER-KIND verification, not the active-slot snapshot.
        isKindVerified: jest.fn(() => isVerified),
        rebindCid: jest.fn(),
        setAuthenticated: jest.fn(),
    }) as unknown as ISocketManager;

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

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate, kind: 'relay' });

        expect(order).toEqual(['logout', 'register']); // revoke old session BEFORE registering new identity
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'social-token', authId: 'social-auth', sign: expect.any(Function) })
        );
    });

    it('is a no-op when the registration token already matches the SDK token (SDK writeback guard)', async () => {
        const order: string[] = [];
        const auth = makeAuth('same-token', order);
        const delegate = makeDelegate({ token: 'same-token', authId: 'auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate, kind: 'relay' });

        expect(order).toEqual([]);
        expect(auth.logout).not.toHaveBeenCalled();
        expect(auth.register).not.toHaveBeenCalled();
    });

    it('registers the new identity but SKIPS the revoke when the socket is not verified (no dropped edge)', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth, false), delegate, kind: 'relay' });

        // register still runs (so the new identity is applied on the next handshake — edge not lost),
        // but auth.logout is skipped (it would 503 on a disconnected socket).
        expect(order).toEqual(['register']);
        expect(auth.logout).not.toHaveBeenCalled();
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'social-token', authId: 'social-auth' })
        );
    });

    it('re-closes the activation gate after registering on a DISCONNECTED socket (device.save:ok ordering)', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth, false, 'closed'), delegate, kind: 'relay' });

        // register re-activated the controller; without stop() the SDK would auto-send auth.update
        // on the next `connected` BEFORE that connection's device.save:ok and fail terminally.
        expect(order).toEqual(['register', 'stop']);
    });

    it('leaves the gate open when registering on a LIVE connection (update fires in order right here)', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth, true, 'connected'), delegate, kind: 'relay' });

        expect(order).toEqual(['logout', 'register']);
        expect(auth.stop).not.toHaveBeenCalled();
    });

    it('does nothing when there is no active client', async () => {
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(null), delegate, kind: 'relay' });

        expect(delegate.getAuthRegistration).not.toHaveBeenCalled();
    });

    it('does nothing (no logout) when no registration is available', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate(null);

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate, kind: 'relay' });

        expect(order).toEqual([]);
        expect(auth.logout).not.toHaveBeenCalled();
    });

    it('routes the registered sign callback to delegate.signAuth with the switch target', async () => {
        const order: string[] = [];
        const auth = makeAuth('guest-token', order);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager: makeManager(auth), delegate, kind: 'relay' });

        const registerCall = auth.register.mock.calls[0] as any;
        const registeredSign = registerCall[0].sign as (token: string, ctx?: { target?: string }) => Promise<unknown>;
        await registeredSign('sdk-token', { target: 'uid@sid' });
        expect(delegate.signAuth).toHaveBeenCalledWith('relay', 'sdk-token', 'uid@sid');
    });

    it('cid가 주어지면 핸드셰이크 전에 rebindCid로 캐시 귀속을 새 클라우드로 옮긴다 (#1/§8-4)', async () => {
        const auth = makeAuth('cloud-a-token', []);
        const manager = makeManager(auth);
        const delegate = makeDelegate({ token: 'cloud-b-token', authId: 'cloud-b-auth' });

        await reauthenticateActiveSocket({ manager, delegate, kind: 'cloud', cid: 'cloud-b' });

        expect(manager.rebindCid).toHaveBeenCalledWith('cloud', 'cloud-b');
    });

    it('cid가 undefined면 rebindCid를 호출하지 않는다', async () => {
        const auth = makeAuth('guest-token', []);
        const manager = makeManager(auth);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager, delegate, kind: 'relay' });

        expect(manager.rebindCid).not.toHaveBeenCalled();
    });

    it('검증된 슬롯이면 register 전에 setAuthenticated(kind,false)로 동기적 verified 딥을 만든다 (#4 rising edge)', async () => {
        const auth = makeAuth('guest-token', []);
        const manager = makeManager(auth, true);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager, delegate, kind: 'relay' });

        expect(manager.setAuthenticated).toHaveBeenCalledWith('relay', false);
    });

    it('검증되지 않은 슬롯이면 딥(setAuthenticated)을 만들지 않는다', async () => {
        const auth = makeAuth('guest-token', []);
        const manager = makeManager(auth, false);
        const delegate = makeDelegate({ token: 'social-token', authId: 'social-auth' });

        await reauthenticateActiveSocket({ manager, delegate, kind: 'relay' });

        expect(manager.setAuthenticated).not.toHaveBeenCalled();
    });
});
