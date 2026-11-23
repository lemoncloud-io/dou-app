import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

import { applySessionToken } from './applySessionToken';
import { SocketManager } from '@chatic/transport/socket/SocketManager';
import { getSocketManager } from '@chatic/transport/socket/runtime';
import { RELAY_SLOT } from '@chatic/transport/socket/utils/slotKey';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockLoginRelayByToken = jest.fn();
const mockGetServerAuthRegistration = jest.fn();
const mockSignServerAuth = jest.fn();
jest.mock('../session/relaySession', () => ({
    relaySession: {
        loginByToken: (...args: unknown[]) => mockLoginRelayByToken(...args),
        clearAndRedirect: jest.fn(),
    },
}));
jest.mock('../session/sessionAuthAdapter', () => ({
    sessionAuthAdapter: {
        getAuthRegistration: (...args: unknown[]) => mockGetServerAuthRegistration(...args),
        signAuth: (...args: unknown[]) => mockSignServerAuth(...args),
        commitRefreshedToken: jest.fn(),
    },
}));

jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: jest.fn() }));
jest.mock('@lemoncloud/chatic-sockets-lib', () => ({ createClientSocketV2: jest.fn() }));

const mockedGetSocketManager = getSocketManager as jest.MockedFunction<typeof getSocketManager>;
const mockedCreate = createClientSocketV2 as jest.MockedFunction<typeof createClientSocketV2>;

const GUEST_IDENTITY = 'guest-identity-token';
const MAIN_IDENTITY = 'main-identity-token';

const mainUserToken = () => ({
    id: '1000031',
    userRole: 'user',
    Token: { authId: 'auth-main', accountId: '0000', identityId: 'id-main', identityToken: MAIN_IDENTITY },
    $auth: { id: 'auth-main' },
});

type AuthStateListener = (state: string) => void;

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

const bootRelayManager = (client: ClientSocketV2) => {
    const manager = new SocketManager();
    mockedCreate.mockReturnValue(client);
    manager.ensure({ url: 'wss://relay.example.com', deviceId: 'device-1', wssType: 'relay', cid: 'default' });
    manager.setAuthenticated(RELAY_SLOT, true);
    mockedGetSocketManager.mockReturnValue(manager);
    return manager;
};

beforeEach(() => transportPlatform.configure(fakeTransportPorts()));

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
        const relay = manager.getScopedClient(RELAY_SLOT);

        await expect(relay.request('invite.create', { phone: '01012345678', name: '친구' })).rejects.toThrow(/^403/);

        await applySessionToken(mainUserToken());

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
            isSlotVerified: jest.fn(() => false),
            setAuthenticated: jest.fn(),
        };
        mockedGetSocketManager.mockReturnValue(manager as never);

        await expect(applySessionToken(mainUserToken())).resolves.toBeUndefined();
        expect(mockLoginRelayByToken).toHaveBeenCalledTimes(1);
    });

    it('타임아웃 안에 재인증이 확인되지 않으면 reject한다 (커밋은 유지 — 다음 핸드셰이크가 적용)', async () => {
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        auth.register.mockImplementation(({ token }: { token: string }) => {
            order.push('auth.register');
            auth.token = token;
            auth.state = 'pending';
        });
        bootRelayManager(client);

        await expect(applySessionToken(mainUserToken(), { timeoutMs: 20 })).rejects.toThrow(/not confirmed within/);
        expect(mockLoginRelayByToken).toHaveBeenCalledTimes(1);
    });

    it('[로그아웃 회귀] 디바이스 식별 저장소를 건드리지 않는다 — 로그아웃 후 같은 디바이스 유저로 복귀하는 전제', async () => {
        localStorage.setItem('chatic-device-id', 'device-1');
        const { client } = makeFakeRelaySocket([]);
        bootRelayManager(client);

        await applySessionToken(mainUserToken());

        expect(localStorage.getItem('chatic-device-id')).toBe('device-1');
        expect(localStorage.length).toBe(1);
    });

    it('재인증이 조용히 건너뛰어져 소켓이 옛 신원에 남으면 reject한다 — 성공으로 위장하지 않는다', async () => {
        mockGetServerAuthRegistration.mockResolvedValue(null);
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        const manager = bootRelayManager(client);

        await expect(applySessionToken(mainUserToken())).rejects.toThrow(/did not adopt the new identity/);

        expect(auth.register).not.toHaveBeenCalled();
        expect(auth.token).toBe(GUEST_IDENTITY);
        await expect(
            manager.getScopedClient(RELAY_SLOT).request('invite.create', { phone: '01012345678', name: '친구' })
        ).rejects.toThrow(/^403/);
    });

    it('SDK가 이미 새 토큰을 들고 있으면(binder 선행) 재인증은 no-op으로 수렴하고 ready만 기다린다', async () => {
        const order: string[] = [];
        const { client, auth } = makeFakeRelaySocket(order);
        auth.token = MAIN_IDENTITY;
        bootRelayManager(client);

        await expect(applySessionToken(mainUserToken())).resolves.toBeUndefined();

        expect(auth.logout).not.toHaveBeenCalled();
        expect(auth.register).not.toHaveBeenCalled();
    });
});
