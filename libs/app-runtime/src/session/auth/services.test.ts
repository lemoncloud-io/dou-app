import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import {
    applySelectedSite,
    commitServerRefreshedToken,
    createCredentialsByProvider,
    getServerAuthRegistration,
    initializeRelaySession,
    loginRelayByToken,
    loginRelayGuestByDevice,
    loginRelayUser,
    loginRelaySocial,
    logoutCloudSession,
    persistDeviceId,
    signServerAuth,
    switchCloudSession,
} from './services';

const mockExchangeOAuthCode = jest.fn();
const mockIssueCloudDelegationToken = jest.fn();
const mockIssueCloudToken = jest.fn();
const mockLoginRelayRequest = jest.fn();
const mockRegisterDevice = jest.fn();
const mockVerifyNativeAppToken = jest.fn();

const mockSetUseXLemonLanguage = jest.fn();
const mockIsAuthenticated = jest.fn();
const mockHasStoredRelaySession = jest.fn();
const mockBuildCredentialsByToken = jest.fn();
const mockLogout = jest.fn();
const mockStartWebCoreInit = jest.fn();
const mockResetWebCoreInit = jest.fn();
const mockClearRelayTransportOverrides = jest.fn();
const mockPost = jest.fn();

const mockSaveDelegationToken = jest.fn();
const mockGetDelegationToken = jest.fn();
const mockSaveCloudToken = jest.fn();
const mockGetCloudToken = jest.fn();
const mockGetCachedCloudTokens = jest.fn();
const mockSetCachedCloudTokens = jest.fn();
const mockSaveSelectedCloudId = jest.fn();
const mockGetSelectedCloudId = jest.fn();
const mockSaveSelectedSiteId = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockClearSelectedSite = jest.fn();
const mockClearPlaceOrder = jest.fn();
const mockClearDelegationToken = jest.fn();
const mockClearSession = jest.fn();
const mockGetIdentityToken = jest.fn();
const mockGetBackend = jest.fn();
const mockGetWss = jest.fn();

const mockRelayClearSelectedSite = jest.fn();
const mockRelaySaveRelayToken = jest.fn();
const mockRelayGetRelayToken = jest.fn();
const mockRelayGetIdentityToken = jest.fn();

// Per-server bridge helper deps. mockGetActiveServerContext backs the "routing ignores active
// context" assertions in the per-server suite.
const mockGetActiveServerContext = jest.fn();
const mockGetTokenSignature = jest.fn();
const mockCalcSignature = jest.fn();

const mockIdentitySetDelegatorId = jest.fn();
const mockIdentitySetDeviceId = jest.fn();

const mockSetSessionIdentityState = jest.fn();
const mockSetSessionAuthenticated = jest.fn();
const mockSetSelectedCloudId = jest.fn();
const mockSetSelectedSiteId = jest.fn();
const mockClearRelaySession = jest.fn();
const mockRebuildSessionIdentity = jest.fn();

const mockGetCloudSessionSnapshot = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
const mockIsNative = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

// `data`가 services.ts의 유일한 HTTP 경로다 — 세션 재료 호출 전부의 목 이음새가 여기다.
// 인자 모양은 repository 계약 그대로 검증한다(객체). 이름을 바꿔주던 `auth/api.ts` 어댑터가
// 사라졌으므로, 지금 이 목이 실제 경계다.
jest.mock('../../data/runtime', () => ({
    getRepositories: () => ({
        auth: {
            delegateCloud: (...args: unknown[]) => mockIssueCloudDelegationToken(...args),
            exchangeToken: (...args: unknown[]) => mockIssueCloudToken(...args),
            login: (...args: unknown[]) => mockLoginRelayRequest(...args),
            registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
            verifyNativeToken: (...args: unknown[]) => mockVerifyNativeAppToken(...args),
            exchangeCode: (...args: unknown[]) => mockExchangeOAuthCode(...args),
        },
    }),
}));

jest.mock('@chatic/web-config', () => ({
    LANGUAGE_KEY: 'i18nextLng',
    clearRelayTransportOverrides: (...args: unknown[]) => mockClearRelayTransportOverrides(...args),
}));

// Transport + sealed boot control. The instance moved out of `@chatic/web-config` into the
// `http/transport` assembly point (built by `@chatic/http`), so the mock follows it — the env leaf
// above keeps only env.
jest.mock('../../http/transport', () => ({
    startWebTransportInit: (...args: unknown[]) => mockStartWebCoreInit(...args),
    resetWebTransportInit: (...args: unknown[]) => mockResetWebCoreInit(...args),
    hasStoredRelaySession: (...args: unknown[]) => mockHasStoredRelaySession(...args),
    webTransport: {
        setUseXLemonLanguage: (...args: unknown[]) => mockSetUseXLemonLanguage(...args),
        isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
        buildCredentialsByToken: (...args: unknown[]) => mockBuildCredentialsByToken(...args),
        getTokenSignature: (...args: unknown[]) => mockGetTokenSignature(...args),
        logout: (...args: unknown[]) => mockLogout(...args),
    },
}));

// 이관 전 web-core에서 `./contexts` · `./core` · `./contextStore` · `./utils` 네 모듈로 나뉘어
// 있던 목을 하나로 합친 것 — 이제 전부 `session/store` 배럴 뒤에 있다.
// `signServerAuth` now calls `@chatic/auth-sign` directly instead of web-core's `calcSignature`
// shim. The mock keeps the old assertion shape — (payload, current, userAgent) — so the kind-specific
// authId contract stays pinned by the same two cases.
jest.mock('@chatic/auth-sign', () => ({
    LemonHmacSigner: class {
        sign(payload: unknown, context: { current: string; userAgent: string }) {
            return {
                signature: mockCalcSignature(payload, context.current, context.userAgent),
                current: context.current,
            };
        }
    },
}));

jest.mock('../store/stores', () => ({
    CLOUD_INVITED_BUNDLES_KEY: 'invited-cloud-bundles',
    cloudStore: {
        saveDelegationToken: (...args: unknown[]) => mockSaveDelegationToken(...args),
        getDelegationToken: (...args: unknown[]) => mockGetDelegationToken(...args),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCloudToken: (...args: unknown[]) => mockGetCloudToken(...args),
        getCachedCloudTokens: (...args: unknown[]) => mockGetCachedCloudTokens(...args),
        setCachedCloudTokens: (...args: unknown[]) => mockSetCachedCloudTokens(...args),
        saveSelectedCloudId: (...args: unknown[]) => mockSaveSelectedCloudId(...args),
        getSelectedCloudId: (...args: unknown[]) => mockGetSelectedCloudId(...args),
        saveSelectedSiteId: (...args: unknown[]) => mockSaveSelectedSiteId(...args),
        getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
        clearSelectedSite: (...args: unknown[]) => mockClearSelectedSite(...args),
        clearPlaceOrder: (...args: unknown[]) => mockClearPlaceOrder(...args),
        clearDelegationToken: (...args: unknown[]) => mockClearDelegationToken(...args),
        clearSession: (...args: unknown[]) => mockClearSession(...args),
        getIdentityToken: (...args: unknown[]) => mockGetIdentityToken(...args),
        getBackend: (...args: unknown[]) => mockGetBackend(...args),
        getWss: (...args: unknown[]) => mockGetWss(...args),
    },
    identityStore: {
        setDelegatorId: (...args: unknown[]) => mockIdentitySetDelegatorId(...args),
        setDeviceId: (...args: unknown[]) => mockIdentitySetDeviceId(...args),
    },
    relayStore: {
        clearSelectedSite: (...args: unknown[]) => mockRelayClearSelectedSite(...args),
        saveRelayToken: (...args: unknown[]) => mockRelaySaveRelayToken(...args),
        getRelayToken: (...args: unknown[]) => mockRelayGetRelayToken(...args),
        getIdentityToken: (...args: unknown[]) => mockRelayGetIdentityToken(...args),
    },
}));

jest.mock('../store', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: (...args: unknown[]) => mockSetSessionIdentityState(...args),
    setSessionAuthenticated: (...args: unknown[]) => mockSetSessionAuthenticated(...args),
    setSelectedCloudId: (...args: unknown[]) => mockSetSelectedCloudId(...args),
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: (...args: unknown[]) => mockClearRelaySession(...args),
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
    notifySessionStateChanged: (...args: unknown[]) => mockNotifySessionStateChanged(...args),
}));

jest.mock('@chatic/shared', () => ({
    storage: {
        get: jest.fn(),
    },
}));

jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
    logger: {
        debug: (...args: unknown[]) => mockLoggerDebug(...args),
        info: (...args: unknown[]) => mockLoggerInfo(...args),
        error: (...args: unknown[]) => mockLoggerError(...args),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
    },
    webClient: {
        post: (...args: unknown[]) => mockPost(...args),
    },
}));

describe('session/services', () => {
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

        await initializeRelaySession();

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

        await initializeRelaySession();

        // audit §7 Phase 2-2: the boot probe is read-only; refresh belongs to the socket
        // AuthController (or an explicit requestRelaySessionRefresh) — never to boot.
        expect(mockIsAuthenticated).not.toHaveBeenCalled();
    });

    it('reports unauthenticated when no relay session is stored (guest boot)', async () => {
        mockHasStoredRelaySession.mockResolvedValue(false);

        await initializeRelaySession();

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

        const result = await loginRelayGuestByDevice('device-1');

        expect(result).toBe(tokenView);
        expect(localStorage.getItem('chatic-device-id')).toBe('device-1');
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

        await loginRelaySocial({
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

        const result = await loginRelayByToken(tokenView);

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

        const result = await loginRelayUser({
            body: { loginId: 'user@example.com', password: 'pw' } as never,
            email: true,
        });

        expect(result).toBe(tokenView);
        expect(mockLoginRelayRequest).toHaveBeenCalledWith({ loginId: 'user@example.com', password: 'pw' }, true);
        // A user login does not touch delegatorId (only guest login sets it).
        expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    it('switches cloud session and clears site state when moving to another cloud', async () => {
        const userToken = {
            Token: { identityToken: 'cloud-token' },
            id: 'cloud-user',
            uid: 'cloud-user',
            name: 'Cloud User',
            photo: 'photo',
        } as unknown as UserTokenView;
        mockIssueCloudDelegationToken.mockResolvedValue({
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
            delegationToken: 'delegation-token',
        });
        mockIssueCloudToken.mockResolvedValue(userToken);
        mockGetSelectedCloudId.mockReturnValue('cloud-old');

        const result = await switchCloudSession({ cloudId: 'cloud-new' });

        expect(mockIssueCloudDelegationToken).toHaveBeenCalledWith('cloud-new');
        expect(mockIssueCloudToken).toHaveBeenCalledWith({
            baseURL: 'https://cloud.example.com',
            body: { delegationToken: 'delegation-token' },
        });
        expect(mockSaveDelegationToken).toHaveBeenCalled();
        expect(mockSaveCloudToken).toHaveBeenCalled();
        // Freshly-issued tokens are cached by cloudId for a fast re-switch.
        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-new', {
            delegationToken: {
                backend: 'https://cloud.example.com',
                wss: 'wss://cloud.example.com',
                delegationToken: 'delegation-token',
            },
            cloudToken: userToken,
        });
        expect(mockClearSelectedSite).toHaveBeenCalledTimes(1);
        expect(mockClearPlaceOrder).toHaveBeenCalledWith('cloud-new');
        // Cloud token saved above; identity is rebuilt (uid re-derives from the active cloud token).
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        expect(mockSetSelectedCloudId).toHaveBeenCalledWith('cloud-new');
        expect(result).toEqual({
            cloudId: 'cloud-1',
            siteId: 'site-1',
            identityToken: 'identity-token',
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
        });
    });

    it('reuses cached cloud tokens on a re-switch — skips both HTTP token exchanges', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        const cachedDelegation = {
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
            delegationToken: 'cached-delegation',
        };
        const cachedCloudToken = {
            id: 'cloud-user',
            Token: { identityToken: 'cached-token' },
        } as unknown as UserTokenView;
        mockGetCachedCloudTokens.mockReturnValue({ delegationToken: cachedDelegation, cloudToken: cachedCloudToken });

        await switchCloudSession({ cloudId: 'cloud-new' });

        // Cache hit → no HTTP round trips; the committed tokens come straight from the cache.
        expect(mockIssueCloudDelegationToken).not.toHaveBeenCalled();
        expect(mockIssueCloudToken).not.toHaveBeenCalled();
        expect(mockSaveDelegationToken).toHaveBeenCalledWith(cachedDelegation);
        expect(mockSaveCloudToken).toHaveBeenCalledWith(cachedCloudToken);
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
    });

    it('pre-applies the target cid before the token exchange (optimistic)', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        // Capture the optimistic cid that is already committed by the time the exchange runs.
        let cidAtExchange: string | undefined;
        mockIssueCloudDelegationToken.mockImplementation(async () => {
            cidAtExchange = mockSaveSelectedCloudId.mock.calls.at(-1)?.[0] as string | undefined;
            return {
                backend: 'https://cloud.example.com',
                wss: 'wss://cloud.example.com',
                delegationToken: 'delegation-token',
            };
        });
        mockIssueCloudToken.mockResolvedValue({
            Token: { identityToken: 'cloud-token' },
            id: 'cloud-user',
            uid: 'cloud-user',
        } as unknown as UserTokenView);

        await switchCloudSession({ cloudId: 'cloud-new' });

        expect(cidAtExchange).toBe('cloud-new');
        expect(mockClearSelectedSite).toHaveBeenCalled();
    });

    it('rolls cid and sid back to the previous cloud when the exchange fails', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockGetSelectedSiteId.mockReturnValue('site-old');
        mockIssueCloudDelegationToken.mockRejectedValue(new Error('exchange failed'));

        await expect(switchCloudSession({ cloudId: 'cloud-new' })).rejects.toThrow('exchange failed');

        const cidCalls = mockSaveSelectedCloudId.mock.calls.map(c => c[0]);
        expect(cidCalls).toEqual(['cloud-new', 'cloud-old']); // optimistic then rollback
        expect(mockSaveSelectedSiteId).toHaveBeenCalledWith('site-old'); // previous sid restored
    });

    describe('applySelectedSite (optimistic sid primitive for the app-runtime socket switch)', () => {
        it('applies the selected site and notifies (used for optimistic pre-apply and rollback)', () => {
            applySelectedSite('site-new');

            expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-new');
            expect(mockNotifySessionStateChanged).toHaveBeenCalled();
        });

        it('clears the selected site when passed null', () => {
            applySelectedSite(null);

            expect(mockSetSelectedSiteId).toHaveBeenCalledWith(null);
            expect(mockNotifySessionStateChanged).toHaveBeenCalled();
        });
    });

    it('fully clears the cloud session (returns to default) during cloud logout, leaving relay intact', () => {
        logoutCloudSession();

        // Clears the whole cloud session (delegation + cloud token + selected cloud/site) so
        // cloud.isActive → false and uid/activeServer fall back to relay.
        expect(mockClearSession).toHaveBeenCalledTimes(1);
        expect(mockRebuildSessionIdentity).toHaveBeenCalledTimes(1);
        expect(mockNotifySessionStateChanged).toHaveBeenCalledTimes(1);
        // Relay session is untouched during cloud logout.
        expect(mockClearRelaySession).not.toHaveBeenCalled();
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

    // ⑪ device registration: deviceId persisted to identityStore (and localStorage)
    it('persists deviceId to identityStore and localStorage', () => {
        persistDeviceId('device-42');

        expect(localStorage.getItem('chatic-device-id')).toBe('device-42');
        expect(mockIdentitySetDeviceId).toHaveBeenCalledWith('device-42');
    });
});

// Per-server (kind-explicit) bridge helpers for the dual-socket path (multi-socket-design.md §7):
// verify the explicit-kind routing directly (no active-server context).
describe('session/services · per-server bridge helpers', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        localStorage.clear();
    });

    it('getServerAuthRegistration은 kind별로 authId를 시드한다 (relay: $auth.id, cloud: Token.authId)', async () => {
        // relay branch: relay identity token + $auth.id (NOT getTokenSignature / Token.authId)
        mockRelayGetIdentityToken.mockReturnValue('relay-identity-token');
        mockRelayGetRelayToken.mockReturnValue({ $auth: { id: 'relay-auth-id' }, Token: { authId: 'http-id' } });
        await expect(getServerAuthRegistration('relay')).resolves.toEqual({
            token: 'relay-identity-token',
            authId: 'relay-auth-id',
        });

        // cloud branch: authId from Token.authId (cloud tokens carry no $auth, so — unlike relay —
        // Token.authId is the socket-auth key). $auth is present in the mock to prove it is NOT used.
        mockGetIdentityToken.mockReturnValue('cloud-identity-token');
        mockGetCloudToken.mockReturnValue({ $auth: { id: 'cloud-auth-id' }, Token: { authId: 'http-id' } });
        await expect(getServerAuthRegistration('cloud')).resolves.toEqual({
            token: 'cloud-identity-token',
            authId: 'http-id',
        });

        // the HTTP-path signature helper must NOT be consulted for socket registration
        expect(mockGetTokenSignature).not.toHaveBeenCalled();
        // getActiveServerContext must NOT be consulted — routing is purely the kind arg
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('signServerAuth(cloud)는 Token.authId를 HMAC 키로 서명하고 target은 서명을 바꾸지 않는다', async () => {
        mockGetCloudToken.mockReturnValue({
            $auth: { id: 'cloud-auth-id' },
            Token: { authId: 'http-id', accountId: 'acct', identityId: 'ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('cloud-sig');

        await signServerAuth('cloud', 'uid@sid');

        // cloud signs with Token.authId (not $auth.id — cloud tokens have no $auth); accountId/identityId
        // also come from Token.
        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'http-id', accountId: 'acct', identityId: 'ident', identityToken: '' },
            expect.any(String),
            expect.any(String)
        );
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('signServerAuth(relay)는 Token.authId가 아니라 $auth.id로 서명한다 (getTokenSignature 미사용)', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('relay-sig');

        const result = await signServerAuth('relay');

        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'relay-auth-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: '' },
            expect.any(String),
            expect.any(String)
        );
        expect(result.signature).toBe('relay-sig');
        // socket signature must not fall back to the HTTP-path (Token.authId) helper
        expect(mockGetTokenSignature).not.toHaveBeenCalled();
    });

    it('signServerAuth(relay)는 $auth.id가 없으면 던진다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { accountId: 'a', identityId: 'i' } });

        await expect(signServerAuth('relay')).rejects.toThrow('Missing relay token fields');
    });

    it('commitServerRefreshedToken(relay)는 view에 identityToken이 있으면 그대로 relay store에 쓴다 (§6-6)', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockRelayGetRelayToken.mockReturnValue(null);
        // A full credential — the dual-write asserted below only happens when the view carries one.
        const view = {
            id: 'u',
            Token: { identityToken: 'fresh', credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        // relay dual-write, no cloud store touched, and no dependence on the active context
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(expect.objectContaining({ identityToken: 'fresh' }));
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'u', Token: expect.objectContaining({ identityToken: 'fresh' }) })
        );
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(relay)는 refresh view가 identityToken을 생략하면 저장된 값을 보존한다', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept', accountId: 'a' } } as UserTokenView);
        // a socket refresh view carrying a fresh credential but NO identityToken
        const view = {
            id: 'u',
            Token: { credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({
                Token: expect.objectContaining({
                    identityToken: 'kept',
                    credential: { AccessKeyId: 'k', SecretKey: 's' },
                }),
            })
        );
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(expect.objectContaining({ identityToken: 'kept' }));
    });

    // identityPoolId degraded in BOTH copies before this fix: the merge dropped it from relayStore,
    // and the same merged Token goes to lemon's store via buildCredentialsByToken → saveOAuthToken,
    // which writes '' when the field is absent. That made refreshAuthToken's inheritance a no-op.
    it('commitServerRefreshedToken(relay)는 refresh view가 identityPoolId를 생략하면 저장된 값을 보존한다', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockRelayGetRelayToken.mockReturnValue({
            Token: { identityToken: 'kept', identityPoolId: 'pool-1' },
        } as UserTokenView);
        const view = {
            id: 'u',
            Token: { credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityPoolId: 'pool-1' }) })
        );
        // the lemon copy is written from the same merged Token, so it keeps the pool id too
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(expect.objectContaining({ identityPoolId: 'pool-1' }));
    });

    it('commitServerRefreshedToken(relay)는 view가 identityPoolId를 주면 그 값을 쓴다', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityPoolId: 'old' } } as UserTokenView);
        const view = { Token: { identityToken: 't', identityPoolId: 'new' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityPoolId: 'new' }) })
        );
    });

    // `credential` is optional on the wire. lemon's buildCredentialsByToken throws without it, which
    // used to abort the store write too — and the caller fires this with `void`, so it vanished.
    it('commitServerRefreshedToken(relay)는 view에 credential이 없으면 캐시 재빌드를 건너뛰고 store는 저장한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept' } } as UserTokenView);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityToken: 'fresh' }) })
        );
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            'AUTH',
            '[commitServerRefreshedToken] refresh view carried no AWS credential',
            expect.objectContaining({ data: expect.objectContaining({ kind: 'relay' }) })
        );
    });

    // 위 케이스의 나머지 반쪽. 재빌드를 건너뛰면 lemon은 이전 자격증명으로 계속 서명하는데, merge가
    // credential을 흘리면 store 사본만 그것을 잃는다 — 그러면 `credentialFreshness`가 "측정 불가"를
    // 답하고, 만료 서명 실패를 회선 장애와 구분하지 못하게 된다. 두 사본은 같은 것을 가리켜야 한다.
    it('commitServerRefreshedToken(relay)는 view에 credential이 없으면 저장된 credential을 보존한다', async () => {
        const previous = { AccessKeyId: 'k', SecretKey: 's', Expiration: '2026-09-02T01:00:00.000Z' };
        mockRelayGetRelayToken.mockReturnValue({
            Token: { identityToken: 'kept', credential: previous },
        } as unknown as UserTokenView);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ credential: previous }) })
        );
    });

    it('commitServerRefreshedToken(relay)는 credential이 반쪽(SecretKey 누락)이어도 재빌드하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue(null);
        const view = { id: 'u', Token: { credential: { AccessKeyId: 'k' } } } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        // lemon throws on the missing SecretKey exactly as it does on a missing AccessKeyId.
        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(cloud) merges the cloud store (single write, no credential rebuild)', async () => {
        mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('cloud', view);

        expect(mockSaveCloudToken).toHaveBeenCalledWith(expect.objectContaining({ Token: { identityToken: 'new' } }));
        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(cloud)는 per-cloud 캐시도 같이 올린다 — 재입장이 갱신 전 자격증명을 되살리면 안 된다', async () => {
        const delegationToken = { cloudId: 'cloud-1', delegationToken: 'd', backend: 'https://c', wss: 'wss://c' };
        mockGetDelegationToken.mockReturnValue(delegationToken);
        mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('cloud', view);

        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-1', {
            delegationToken,
            cloudToken: expect.objectContaining({ Token: { identityToken: 'new' } }),
        });
    });

    it('commitServerRefreshedToken(cloud)는 delegation 토큰이 없으면 캐시를 건드리지 않는다', async () => {
        mockGetDelegationToken.mockReturnValue(null);

        await commitServerRefreshedToken('cloud', { Token: { identityToken: 'new' } } as unknown as UserTokenView);

        expect(mockSetCachedCloudTokens).not.toHaveBeenCalled();
    });
});
