import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { createCredentialsByProvider, relaySession } from './relaySession';

const mockExchangeOAuthCode = jest.fn();
const mockLoginRelayRequest = jest.fn();
const mockRegisterDevice = jest.fn();
const mockVerifyNativeAppToken = jest.fn();

const mockSetUseXLemonLanguage = jest.fn();
const mockIsAuthenticated = jest.fn();
const mockHasStoredRelaySession = jest.fn();
const mockBuildCredentialsByToken = jest.fn();
const mockLogout = jest.fn();
const mockStartWebCoreInit = jest.fn();

const mockGetSelectedCloudId = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockGetIdentityToken = jest.fn();
const mockGetBackend = jest.fn();
const mockGetWss = jest.fn();

const mockRelaySaveRelayToken = jest.fn();

// Per-server bridge helper deps. mockGetActiveServerContext backs the "routing ignores active
// context" assertions in the per-server suite.
const mockGetActiveServerContext = jest.fn();

const mockIdentitySetDelegatorId = jest.fn();
const mockIdentitySetDeviceId = jest.fn();

const mockSetSessionIdentityState = jest.fn();
const mockSetSessionAuthenticated = jest.fn();

const mockGetCloudSessionSnapshot = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
const mockIsNative = jest.fn();
const mockLoggerWarn = jest.fn();

// `data`가 이 클래스의 유일한 HTTP 경로다 — 세션 재료 호출 전부의 목 이음새가 여기다.
// 인자 모양은 repository 계약 그대로 검증한다(객체). 이름을 바꿔주던 `auth/api.ts` 어댑터가
// 사라졌으므로, 지금 이 목이 실제 경계다.
jest.mock('../../data/runtime', () => ({
    getRepositories: () => ({
        auth: {
            delegateCloud: jest.fn(),
            exchangeToken: jest.fn(),
            login: (...args: unknown[]) => mockLoginRelayRequest(...args),
            registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
            verifyNativeToken: (...args: unknown[]) => mockVerifyNativeAppToken(...args),
            exchangeCode: (...args: unknown[]) => mockExchangeOAuthCode(...args),
        },
    }),
}));

jest.mock('@chatic/web-config', () => ({
    LANGUAGE_KEY: 'i18nextLng',
    clearRelayTransportOverrides: jest.fn(),
}));

// Transport + sealed boot control. The instance moved out of `@chatic/web-config` into the
// `http/transport` assembly point (built by `@chatic/http`), so the mock follows it — the env leaf
// above keeps only env.
jest.mock('../../http/transport', () => ({
    startWebTransportInit: (...args: unknown[]) => mockStartWebCoreInit(...args),
    resetWebTransportInit: jest.fn(),
    hasStoredRelaySession: (...args: unknown[]) => mockHasStoredRelaySession(...args),
    webTransport: {
        setUseXLemonLanguage: (...args: unknown[]) => mockSetUseXLemonLanguage(...args),
        isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
        buildCredentialsByToken: (...args: unknown[]) => mockBuildCredentialsByToken(...args),
        getTokenSignature: jest.fn(),
        logout: (...args: unknown[]) => mockLogout(...args),
    },
}));

// 이관 전 web-core에서 `./contexts` · `./core` · `./contextStore` · `./utils` 네 모듈로 나뉘어
// 있던 목을 하나로 합친 것 — 이제 전부 `session/store` 배럴 뒤에 있다.

jest.mock('../store/stores', () => ({
    CLOUD_INVITED_BUNDLES_KEY: 'invited-cloud-bundles',
    cloudStore: {
        saveDelegationToken: jest.fn(),
        getDelegationToken: jest.fn(),
        saveCloudToken: jest.fn(),
        getCloudToken: jest.fn(),
        getCachedCloudTokens: jest.fn(),
        setCachedCloudTokens: jest.fn(),
        saveSelectedCloudId: jest.fn(),
        getSelectedCloudId: (...args: unknown[]) => mockGetSelectedCloudId(...args),
        saveSelectedSiteId: jest.fn(),
        getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
        clearSelectedSite: jest.fn(),
        clearDelegationToken: jest.fn(),
        clearSession: jest.fn(),
        getIdentityToken: (...args: unknown[]) => mockGetIdentityToken(...args),
        getBackend: (...args: unknown[]) => mockGetBackend(...args),
        getWss: (...args: unknown[]) => mockGetWss(...args),
    },
    identityStore: {
        setDelegatorId: (...args: unknown[]) => mockIdentitySetDelegatorId(...args),
        setDeviceId: (...args: unknown[]) => mockIdentitySetDeviceId(...args),
    },
    relayStore: {
        clearSelectedSite: jest.fn(),
        saveRelayToken: (...args: unknown[]) => mockRelaySaveRelayToken(...args),
        getRelayToken: jest.fn(),
        getIdentityToken: jest.fn(),
    },
}));

jest.mock('../store', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: (...args: unknown[]) => mockSetSessionIdentityState(...args),
    setSessionAuthenticated: (...args: unknown[]) => mockSetSessionAuthenticated(...args),
    setSelectedSiteId: jest.fn(),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: jest.fn(),
    rebuildSessionIdentity: jest.fn(),
    // The store announces KINDS now (ADR-0076 결정 2). `mockNotifySessionStateChanged` stands for
    // `emit`, so the existing "was the session announced" assertions keep their meaning; `batch`
    // runs straight through because the collapsing is covered by signal.test.ts.
    sessionSignal: {
        emit: (...args: unknown[]) => mockNotifySessionStateChanged(...args),
        batch: (fn: () => unknown) => fn(),
        subscribe: jest.fn(() => () => undefined),
        registerInvalidator: jest.fn(),
    },
}));

jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
    },
    webClient: {
        post: jest.fn(),
    },
}));

describe('session/auth/relaySession', () => {
    beforeEach(() => {
        // resetAllMocks (not clearAllMocks): also wipes mockResolvedValue/mockRejectedValue
        // implementations so a per-test rejection cannot leak into the next test. The defaults
        // below are re-established afterward.
        jest.resetAllMocks();
        localStorage.clear();

        mockIsNative.mockReturnValue(false);
        mockIsAuthenticated.mockResolvedValue(true);
        mockStartWebCoreInit.mockResolvedValue(undefined);
        mockSetUseXLemonLanguage.mockResolvedValue(undefined);
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockLogout.mockResolvedValue(undefined);
        mockGetSelectedCloudId.mockReturnValue('default');
        mockGetSelectedSiteId.mockReturnValue(null);
        mockGetCloudSessionSnapshot.mockReturnValue({
            cloudId: 'cloud-1',
            siteId: 'site-1',
            identityToken: 'identity-token',
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
        });
        mockGetIdentityToken.mockReturnValue('identity-token');
        mockGetBackend.mockReturnValue('https://cloud.example.com');
        mockGetWss.mockReturnValue('wss://cloud.example.com');
    });

    it('initializes relay session and updates runtime state from the read-only session probe', async () => {
        mockHasStoredRelaySession.mockResolvedValue(true);

        await relaySession.initialize();

        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(1, {
            isInitialized: false,
            error: null,
        });
        expect(mockStartWebCoreInit).toHaveBeenCalledTimes(1);
        expect(mockSetUseXLemonLanguage).toHaveBeenCalledWith(true, 'i18nextLng');
        expect(mockHasStoredRelaySession).toHaveBeenCalledTimes(1);
        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(2, {
            isInitialized: true,
            isAuthenticated: true,
        });
    });

    it('boot never fires lemon isAuthenticated (its internal refresh is the sealed second engine)', async () => {
        mockHasStoredRelaySession.mockResolvedValue(true);

        await relaySession.initialize();

        // audit §7 Phase 2-2: the boot probe is read-only; refresh belongs to the socket
        // AuthController (or an explicit requestRelaySessionRefresh) — never to boot.
        expect(mockIsAuthenticated).not.toHaveBeenCalled();
    });

    it('reports unauthenticated when no relay session is stored (guest boot)', async () => {
        mockHasStoredRelaySession.mockResolvedValue(false);

        await relaySession.initialize();

        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(2, {
            isInitialized: true,
            isAuthenticated: false,
        });
    });

    it('creates a relay guest session from device login', async () => {
        const tokenView = {
            Token: { identityToken: 'relay-token' },
            uid: 'guest-1',
            $user: { userRole: 'guest', name: 'Guest' },
        } as unknown as UserTokenView;
        mockRegisterDevice.mockResolvedValue(tokenView);

        const result = await relaySession.loginGuestByDevice('device-1');

        expect(result).toBe(tokenView);
        // deviceId goes through identityStore only — the raw localStorage copy had no reader (ADR-0076 A8).
        expect(mockIdentitySetDeviceId).toHaveBeenCalledWith('device-1');
        // Guest role → delegator id is the guest's own uid (for invite acceptance); session authed.
        expect(mockIdentitySetDelegatorId).toHaveBeenCalledWith('guest-1');
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    it('applies social relay login and provider state', async () => {
        const tokenView = {
            Token: { identityToken: 'relay-token' },
            uid: 'user-1',
            $user: { userRole: 'user', name: 'User' },
        } as unknown as UserTokenView;
        mockVerifyNativeAppToken.mockResolvedValue(tokenView);

        await relaySession.loginBySocialToken({
            body: { accessToken: 'token' } as never,
            provider: 'google' as never,
        });

        expect(mockVerifyNativeAppToken).toHaveBeenCalledWith({ accessToken: 'token' });
        // provider is accepted but no longer stored; a social login does not touch delegatorId
        // (only guest login sets it / relay logout clears it).
        expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    it('loginRelayByToken은 발급된 토큰 뷰를 그대로 커밋하고 delegatorId는 건드리지 않는다 (소켓 verify-hash-alias 로그인)', async () => {
        const tokenView = {
            Token: { identityToken: 'main-user-token' },
            uid: 'user-2',
            $auth: { id: 'auth-2' },
            $user: { userRole: 'user', name: 'Main' },
        } as unknown as UserTokenView;

        const result = await relaySession.loginByToken(tokenView);

        expect(result).toBe(tokenView);
        // Same commit as the HTTP login paths: creds rebuilt, token persisted, session authed.
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(tokenView.Token);
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(tokenView);
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
        // No HTTP call happens — the token was already issued over the websocket.
        expect(mockVerifyNativeAppToken).not.toHaveBeenCalled();
        expect(mockLoginRelayRequest).not.toHaveBeenCalled();
        // delegatorId is owned by guest login / relay logout; a promotion must not move it, or the
        // post-logout guest recovery (device-user return) would break.
        expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
    });

    it('logs into relay with the generic relay login endpoint', async () => {
        const tokenView = {
            Token: { identityToken: 'relay-token' },
            uid: 'user-2',
            $user: { userRole: 'user', name: 'Relay User' },
        } as unknown as UserTokenView;
        mockLoginRelayRequest.mockResolvedValue(tokenView);

        const result = await relaySession.loginUser({
            body: { loginId: 'user@example.com', password: 'pw' } as never,
            email: true,
        });

        expect(result).toBe(tokenView);
        expect(mockLoginRelayRequest).toHaveBeenCalledWith({ loginId: 'user@example.com', password: 'pw' }, true);
        // A user login does not touch delegatorId (only guest login sets it).
        expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    // OAuth 교환은 다른 로그인 경로와 같은 모양이어야 한다: 응답이 전체 relay 토큰 뷰이고
    // applyRelaySession이 커밋한다. 예전에는 Token만 남기고 나머지를 버려서, 호출부가 버려진
    // 필드를 되찾으려고 곧바로 refresh 엔드포인트를 쳤다 — 리포의 마지막 HTTP refresh였다.
    it('OAuth 교환이 세션을 커밋한다 — 자격증명·relay 토큰·인증 플래그', async () => {
        const view = {
            id: 'user-1',
            $auth: { id: 'auth-1' },
            Token: { identityToken: 'jwt-1' },
        } as unknown as UserTokenView;
        mockExchangeOAuthCode.mockResolvedValue(view);

        await createCredentialsByProvider('google', 'code-1');

        expect(mockExchangeOAuthCode).toHaveBeenCalledWith({ provider: 'google', code: 'code-1' });
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(view.Token);
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(view);
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    it('교환 응답에 $auth.id가 없으면 경고한다 — 릴레이 소켓이 등록하지 못한다', async () => {
        mockExchangeOAuthCode.mockResolvedValue({ id: 'user-1', Token: { identityToken: 'jwt-1' } } as never);

        await createCredentialsByProvider('google', 'code-1');

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'AUTH',
            expect.stringContaining('$auth.id'),
            expect.objectContaining({ data: { provider: 'google' } })
        );
    });

    // ⑪ device registration: deviceId persisted through identityStore ONLY
    it('persists deviceId through identityStore and writes no raw localStorage copy', () => {
        relaySession.persistDeviceId('device-42');

        expect(mockIdentitySetDeviceId).toHaveBeenCalledWith('device-42');
        // The raw `localStorage.setItem('chatic-device-id', …)` is gone: nothing read that slot on the
        // web (the reader is useSessionDeviceId → sessionStorage) and inside a shell it merely
        // duplicated the store's own write (ADR-0076 A8).
        expect(localStorage.getItem('chatic-device-id')).toBeNull();
    });
});
