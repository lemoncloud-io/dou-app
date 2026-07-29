import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { applySessionToken } from './applySessionToken';
import { SocketManager } from '../SocketManager';
import { getSocketManager } from '../runtime';

jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// web-core is the store boundary: applySessionToken commits through loginRelayByToken, and the
// session delegate reads the committed registration back via getServerAuthRegistration.
const mockLoginRelayByToken = jest.fn();
const mockGetServerAuthRegistration = jest.fn();
const mockSignServerAuth = jest.fn();
jest.mock('@chatic/web-core', () => ({
    loginRelayByToken: (...args: unknown[]) => mockLoginRelayByToken(...args),
    getServerAuthRegistration: (...args: unknown[]) => mockGetServerAuthRegistration(...args),
    signServerAuth: (...args: unknown[]) => mockSignServerAuth(...args),
    commitServerRefreshedToken: jest.fn(),
    logoutCloudSession: jest.fn(),
}));

jest.mock('../runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));

const mockedGetSocketManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;
const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;

const GUEST_IDENTITY = 'guest-identity-token';
const MAIN_IDENTITY = 'main-identity-token';

/** A `$token` shaped like the sockets-api fixture (verify-hash-alias-sample.json). */
const mainUserToken = () => ({
    id: '1000031',
    userRole: 'user',
    Token: { authId: 'auth-main', accountId: '0000', identityId: 'id-main', identityToken: MAIN_IDENTITY },
    $auth: { id: 'auth-main' },
});

type AuthStateListener = (state: string) => void;

/**
 * Fake relay socket mirroring the SDK subset applySessionToken exercises: an AuthController with
 * logout()/register()/ready() semantics (register resumes and re-handshakes asynchronously) and a
 * request() that plays the RELAY SERVER — it authorizes invite.create only for an authenticated
 * MAIN-user identity, rejecting the device user with the wire-shaped `403 FORBIDDEN - …` error.
 */
const makeFakeRelaySocket = (order: string[]) => {
    const listeners = new Set<AuthStateListener>();
    const emit = (state: string) => listeners.forEach(listener => listener(state));

    const auth = {
        token: GUEST_IDENTITY,
        state: 'authenticated',
        logout: jest.fn(() => {
            order.push('auth.logout');
            auth.token = '';
            auth.state = '';
            emit('');
            return Promise.resolve();
        }),
        register: jest.fn(({ token }: { token: string }) => {
            order.push('auth.register');
            auth.token = token;
            auth.state = 'pending';
            emit('pending');
            // The fake server acks auth.update on a microtask — same "resolves later" shape as the SDK.
            queueMicrotask(() => {
                auth.state = 'authenticated';
                emit('authenticated');
            });
        }),
        ready: () => {
            if (auth.state === 'authenticated') return Promise.resolve();
            return new Promise<void>((resolve, reject) => {
                const listener: AuthStateListener = state => {
                    if (state === 'authenticated') {
                        listeners.delete(listener);
                        resolve();
                    } else if (state === 'expired') {
                        listeners.delete(listener);
                        reject(new Error('401 UNAUTHORIZED - auth expired'));
                    }
                };
                listeners.add(listener);
            });
        },
        onAuthState: jest.fn((listener: AuthStateListener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }),
        onTokenRefresh: jest.fn(() => jest.fn()),
    };

    const client = {
        state: 'connected',
        auth,
        request: jest.fn((type: string) => {
            if (type !== 'invite.create') return Promise.resolve({});
            if (auth.state === 'authenticated' && auth.token === MAIN_IDENTITY) {
                return Promise.resolve({ id: 'invite-1', state: 'pending' });
            }
            return Promise.reject(new Error('403 FORBIDDEN - main user is required'));
        }),
        send: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
        destroy: jest.fn(),
        onType: jest.fn(() => jest.fn()),
        onState: jest.fn(() => jest.fn()),
        onError: jest.fn(() => jest.fn()),
        onMessage: jest.fn(() => jest.fn()),
    } as unknown as jest.Mocked<ClientSocketV2>;

    return { client, auth };
};

/** Boots a REAL SocketManager around the fake socket, verified as the device user. */
const bootRelayManager = (client: ClientSocketV2) => {
    const manager = new SocketManager();
    mockedCreate.mockReturnValue(client);
    manager.ensure({ url: 'wss://relay.example.com', deviceId: 'device-1', wssType: 'relay' }, 'relay');
    // Mirror what bootstrapSocketConnection's onAuthState wiring does once the guest handshake ends.
    manager.setAuthenticated('relay', true);
    mockedGetSocketManager.mockReturnValue(manager);
    return manager;
};

describe('applySessionToken — verify-hash-alias $token을 relay 세션·소켓에 반영', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoginRelayByToken.mockResolvedValue(undefined);
        mockSignServerAuth.mockResolvedValue({ signature: 'sig', current: 'now' });
        mockGetServerAuthRegistration.mockResolvedValue({ token: MAIN_IDENTITY, authId: 'auth-main' });
    });

    it('[계약 고정] 갱신 전 invite.create는 403이고, applySessionToken 후 같은 relay 연결에서 성공한다', async () => {
        const order: string[] = [];
        const { client } = makeFakeRelaySocket(order);
        const manager = bootRelayManager(client);
        const relay = manager.getScopedClient('relay');

        // BEFORE: the device-user identity is rejected with the wire-shaped 403 (the status prefix
        // is what apps/web getSocketErrorCode reads — never the message wording).
        await expect(relay.request('invite.create', { phone: '01012345678', name: '친구' })).rejects.toThrow(/^403/);

        await applySessionToken(mainUserToken());

        // AFTER: the SAME connection (no reboot — connect() was never re-driven) now issues invites.
        await expect(relay.request('invite.create', { phone: '01012345678', name: '친구' })).resolves.toMatchObject({
            state: 'pending',
        });
        expect(client.connect).not.toHaveBeenCalled();
    });

    it('저장소 커밋(loginRelayByToken)이 소켓 재인증(logout→register)보다 먼저다 — 저장소가 원본', async () => {
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        bootRelayManager(client);
        mockLoginRelayByToken.mockImplementation(() => {
            order.push('loginRelayByToken');
            return Promise.resolve();
        });

        await applySessionToken(mainUserToken());

        expect(order).toEqual(['loginRelayByToken', 'auth.logout', 'auth.register']);
        expect(mockLoginRelayByToken).toHaveBeenCalledWith(expect.objectContaining({ id: '1000031' }));
        expect(auth.register).toHaveBeenCalledWith(
            expect.objectContaining({ token: MAIN_IDENTITY, authId: 'auth-main' })
        );
    });

    it('$token이 비어 있으면(연동만 됨) 아무것도 하지 않는다', async () => {
        await expect(applySessionToken(undefined)).resolves.toBeUndefined();
        await expect(applySessionToken({ attached: true })).resolves.toBeUndefined();

        expect(mockLoginRelayByToken).not.toHaveBeenCalled();
        expect(mockedGetSocketManager).not.toHaveBeenCalled();
    });

    it('identityToken은 있는데 $auth.id가 없으면 커밋 전에 reject한다 — 반쪽 상태(HTTP만 새 신원)를 만들지 않는다', async () => {
        const broken = { ...mainUserToken(), $auth: undefined };

        await expect(applySessionToken(broken)).rejects.toThrow(/\$auth\.id/);
        expect(mockLoginRelayByToken).not.toHaveBeenCalled();
    });

    it('relay 슬롯이 아직 없으면 커밋까지만 하고 resolve한다 (다음 부트가 새 토큰으로 register)', async () => {
        const manager = {
            getClient: jest.fn(() => null),
            isKindVerified: jest.fn(() => false),
            setAuthenticated: jest.fn(),
            rebindCid: jest.fn(),
        };
        mockedGetSocketManager.mockReturnValue(manager as never);

        await expect(applySessionToken(mainUserToken())).resolves.toBeUndefined();
        expect(mockLoginRelayByToken).toHaveBeenCalledTimes(1);
    });

    it('타임아웃 안에 재인증이 확인되지 않으면 reject한다 (커밋은 유지 — 다음 핸드셰이크가 적용)', async () => {
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        // A register that never gets the server ack: the handshake parks (e.g. socket dropped
        // mid-flow) and only the deadline can settle the wait.
        auth.register.mockImplementation(({ token }: { token: string }) => {
            order.push('auth.register');
            auth.token = token;
            auth.state = 'pending';
        });
        bootRelayManager(client);

        await expect(applySessionToken(mainUserToken(), { timeoutMs: 20 })).rejects.toThrow(/not confirmed within/);
        expect(mockLoginRelayByToken).toHaveBeenCalledTimes(1);
    });

    it('SDK가 이미 새 토큰을 들고 있으면(binder 선행) 재인증은 no-op으로 수렴하고 ready만 기다린다', async () => {
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        auth.token = MAIN_IDENTITY; // SocketReauthBinder already re-registered this identity.
        bootRelayManager(client);

        await expect(applySessionToken(mainUserToken())).resolves.toBeUndefined();

        // The token-equality guard in reauthenticateActiveSocket absorbed the double execution.
        expect(auth.logout).not.toHaveBeenCalled();
        expect(auth.register).not.toHaveBeenCalled();
    });
});
