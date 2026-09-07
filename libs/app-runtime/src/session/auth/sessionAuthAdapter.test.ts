import { sessionAuthAdapter } from './sessionAuthAdapter';

const mockBuildCredentialsByToken = jest.fn();

const mockGetDelegationToken = jest.fn();
const mockSaveCloudToken = jest.fn();
const mockGetCloudToken = jest.fn();
const mockSetCachedCloudTokens = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockGetIdentityToken = jest.fn();

const mockRelaySaveRelayToken = jest.fn();
const mockRelayGetRelayToken = jest.fn();
const mockRelayGetIdentityToken = jest.fn();

// Per-server bridge helper deps. mockGetActiveServerContext backs the "routing ignores active
// context" assertions in the per-server suite.
const mockGetActiveServerContext = jest.fn();
const mockGetTokenSignature = jest.fn();
const mockCalcSignature = jest.fn();

const mockNotifySessionStateChanged = jest.fn();
const mockLoggerWarn = jest.fn();

// Transport + sealed boot control. The instance moved out of `@chatic/web-config` into the
// `http/transport` assembly point (built by `@chatic/http`), so the mock follows it — the env leaf
// above keeps only env.
jest.mock('../../http/transport', () => ({
    startWebTransportInit: jest.fn(),
    resetWebTransportInit: jest.fn(),
    hasStoredRelaySession: jest.fn(),
    webTransport: {
        setUseXLemonLanguage: jest.fn(),
        isAuthenticated: jest.fn(),
        buildCredentialsByToken: (...args: unknown[]) => mockBuildCredentialsByToken(...args),
        getTokenSignature: (...args: unknown[]) => mockGetTokenSignature(...args),
        logout: jest.fn(),
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
        saveDelegationToken: jest.fn(),
        getDelegationToken: (...args: unknown[]) => mockGetDelegationToken(...args),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCloudToken: (...args: unknown[]) => mockGetCloudToken(...args),
        getCachedCloudTokens: jest.fn(),
        setCachedCloudTokens: (...args: unknown[]) => mockSetCachedCloudTokens(...args),
        saveSelectedCloudId: jest.fn(),
        getSelectedCloudId: jest.fn(),
        saveSelectedSiteId: jest.fn(),
        getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
        clearSelectedSite: jest.fn(),
        clearDelegationToken: jest.fn(),
        clearSession: jest.fn(),
        getIdentityToken: (...args: unknown[]) => mockGetIdentityToken(...args),
        getBackend: jest.fn(),
        getWss: jest.fn(),
    },
    identityStore: {
        setDelegatorId: jest.fn(),
        setDeviceId: jest.fn(),
    },
    relayStore: {
        clearSelectedSite: jest.fn(),
        saveRelayToken: (...args: unknown[]) => mockRelaySaveRelayToken(...args),
        getRelayToken: (...args: unknown[]) => mockRelayGetRelayToken(...args),
        getIdentityToken: (...args: unknown[]) => mockRelayGetIdentityToken(...args),
    },
}));

jest.mock('../store', () => ({
    getCloudSessionSnapshot: jest.fn(),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: jest.fn(),
    setSessionAuthenticated: jest.fn(),
    setSelectedCloudId: jest.fn(),
    setSelectedSiteId: jest.fn(),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: jest.fn(),
    rebuildSessionIdentity: jest.fn(),
    // The store announces KINDS now (ADR-0074 결정 2). `mockNotifySessionStateChanged` stands for
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
    isNative: jest.fn(),
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

// Per-server (kind-explicit) bridge helpers for the dual-socket path (multi-socket-design.md §7):
// verify the explicit-kind routing directly (no active-server context).
describe('session/auth/sessionAuthAdapter · per-server bridge helpers', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        localStorage.clear();
    });

    it('getServerAuthRegistration은 kind별로 authId를 시드한다 (relay: $auth.id, cloud: Token.authId)', async () => {
        // relay branch: relay identity token + $auth.id (NOT getTokenSignature / Token.authId)
        mockRelayGetIdentityToken.mockReturnValue('relay-identity-token');
        mockRelayGetRelayToken.mockReturnValue({ $auth: { id: 'relay-auth-id' }, Token: { authId: 'http-id' } });
        await expect(sessionAuthAdapter.getAuthRegistration('relay')).resolves.toEqual({
            token: 'relay-identity-token',
            authId: 'relay-auth-id',
        });

        // cloud branch: authId from Token.authId (cloud tokens carry no $auth, so — unlike relay —
        // Token.authId is the socket-auth key). $auth is present in the mock to prove it is NOT used.
        mockGetIdentityToken.mockReturnValue('cloud-identity-token');
        mockGetCloudToken.mockReturnValue({ $auth: { id: 'cloud-auth-id' }, Token: { authId: 'http-id' } });
        await expect(sessionAuthAdapter.getAuthRegistration('cloud')).resolves.toEqual({
            token: 'cloud-identity-token',
            authId: 'http-id',
        });

        // the HTTP-path signature helper must NOT be consulted for socket registration
        expect(mockGetTokenSignature).not.toHaveBeenCalled();
        // getActiveServerContext must NOT be consulted — routing is purely the kind arg
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('sessionAuthAdapter.signAuth(cloud)는 Token.authId를 HMAC 키로 서명하고 target은 서명을 바꾸지 않는다', async () => {
        mockGetCloudToken.mockReturnValue({
            $auth: { id: 'cloud-auth-id' },
            Token: { authId: 'http-id', accountId: 'acct', identityId: 'ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('cloud-sig');

        await sessionAuthAdapter.signAuth('cloud', 'uid@sid');

        // cloud signs with Token.authId (not $auth.id — cloud tokens have no $auth); accountId/identityId
        // also come from Token.
        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'http-id', accountId: 'acct', identityId: 'ident', identityToken: '' },
            expect.any(String),
            expect.any(String)
        );
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('sessionAuthAdapter.signAuth(relay)는 Token.authId가 아니라 $auth.id로 서명한다 (getTokenSignature 미사용)', async () => {
        mockRelayGetRelayToken.mockReturnValue({
            $auth: { id: 'relay-auth-id' },
            Token: { authId: 'http-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('relay-sig');

        const result = await sessionAuthAdapter.signAuth('relay');

        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'relay-auth-id', accountId: 'r-acct', identityId: 'r-ident', identityToken: '' },
            expect.any(String),
            expect.any(String)
        );
        expect(result.signature).toBe('relay-sig');
        // socket signature must not fall back to the HTTP-path (Token.authId) helper
        expect(mockGetTokenSignature).not.toHaveBeenCalled();
    });

    it('sessionAuthAdapter.signAuth(relay)는 $auth.id가 없으면 던진다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { accountId: 'a', identityId: 'i' } });

        await expect(sessionAuthAdapter.signAuth('relay')).rejects.toThrow('Missing relay token fields');
    });

    it('commitServerRefreshedToken(relay)는 view에 identityToken이 있으면 그대로 relay store에 쓴다 (§6-6)', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        mockRelayGetRelayToken.mockReturnValue(null);
        // A full credential — the dual-write asserted below only happens when the view carries one.
        const view = {
            id: 'u',
            Token: { identityToken: 'fresh', credential: { AccessKeyId: 'k', SecretKey: 's' } },
        } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

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

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

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

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

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

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ identityPoolId: 'new' }) })
        );
    });

    // `credential` is optional on the wire. lemon's buildCredentialsByToken throws without it, which
    // used to abort the store write too — and the caller fires this with `void`, so it vanished.
    it('commitServerRefreshedToken(relay)는 view에 credential이 없으면 캐시 재빌드를 건너뛰고 store는 저장한다', async () => {
        mockRelayGetRelayToken.mockReturnValue({ Token: { identityToken: 'kept' } } as UserTokenView);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

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

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(
            expect.objectContaining({ Token: expect.objectContaining({ credential: previous }) })
        );
    });

    it('commitServerRefreshedToken(relay)는 credential이 반쪽(SecretKey 누락)이어도 재빌드하지 않는다', async () => {
        mockRelayGetRelayToken.mockReturnValue(null);
        const view = { id: 'u', Token: { credential: { AccessKeyId: 'k' } } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken('relay', view);

        // lemon throws on the missing SecretKey exactly as it does on a missing AccessKeyId.
        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(cloud) merges the cloud store (single write, no credential rebuild)', async () => {
        mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken('cloud', view);

        expect(mockSaveCloudToken).toHaveBeenCalledWith(expect.objectContaining({ Token: { identityToken: 'new' } }));
        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(cloud)는 per-cloud 캐시도 같이 올린다 — 재입장이 갱신 전 자격증명을 되살리면 안 된다', async () => {
        const delegationToken = { cloudId: 'cloud-1', delegationToken: 'd', backend: 'https://c', wss: 'wss://c' };
        mockGetDelegationToken.mockReturnValue(delegationToken);
        mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        await sessionAuthAdapter.commitRefreshedToken('cloud', view);

        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-1', {
            delegationToken,
            cloudToken: expect.objectContaining({ Token: { identityToken: 'new' } }),
        });
    });

    it('commitServerRefreshedToken(cloud)는 delegation 토큰이 없으면 캐시를 건드리지 않는다', async () => {
        mockGetDelegationToken.mockReturnValue(null);

        await sessionAuthAdapter.commitRefreshedToken('cloud', {
            Token: { identityToken: 'new' },
        } as unknown as UserTokenView);

        expect(mockSetCachedCloudTokens).not.toHaveBeenCalled();
    });
});
