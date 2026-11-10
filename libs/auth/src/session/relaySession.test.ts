import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { MemoryMedium, NativeSecureMedium } from '@chatic/storage';
import { sessionMedia } from '@chatic/session/store/ports';

import { createCredentialsByProvider, relaySession } from './relaySession';
import { signedOutAppKeys } from './storage/signedOutAppKeys.util';

const mockExchangeOAuthCode = jest.fn();
const mockVerifyOAuthCode = jest.fn();
const mockLoginRelayRequest = jest.fn();
const mockRegisterDevice = jest.fn();
const mockVerifyNativeAppToken = jest.fn();

const mockHasStoredRelaySession = jest.fn();
const mockGetRelayToken = jest.fn();
jest.mock('./relayCredentialProbe', () => ({
    relayCredentialProbe: { hasSession: () => mockHasStoredRelaySession() },
}));

const mockGetSelectedCloudId = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockGetIdentityToken = jest.fn();
const mockGetBackend = jest.fn();
const mockGetWss = jest.fn();

const mockRelaySaveRelayToken = jest.fn();
/** Every cloud-store clear, by name — the account teardown is judged by which of them ran. */
const mockCloudClear = jest.fn();

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

// `data` is this class's only HTTP path — this is the mock seam for every session-material call.
// The argument shape is validated exactly as the repository contract has it (an object). The
// `auth/api.ts` adapter that used to rename it is gone, so this mock is now the real boundary.
jest.mock('./authRepository', () => ({
    authRepositorySource: {
        get: () => ({
            delegateCloud: jest.fn(),
            exchangeToken: jest.fn(),
            login: (...args: unknown[]) => mockLoginRelayRequest(...args),
            registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
            verifyNativeToken: (...args: unknown[]) => mockVerifyNativeAppToken(...args),
            exchangeCode: (...args: unknown[]) => mockExchangeOAuthCode(...args),
            verifyOAuthCode: (...args: unknown[]) => mockVerifyOAuthCode(...args),
        }),
    },
}));

// `LANGUAGE_KEY` is a local const in relaySession.ts now (not imported) and `config.clear()`
// no-ops gracefully when `@chatic/config` is never `init()`d, as it is not in this suite — neither
// needs a mock (ADR-0079, replacing `@chatic/web-config`).

// Before the migration, this mock was split across four web-core modules — `./contexts`,
// `./core`, `./contextStore`, `./utils` — and has now been merged into one; they all sit behind
// the `@chatic/session/store` barrel now.

jest.mock('@chatic/session/store/stores', () => ({
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
        clearSession: (...args: unknown[]) => mockCloudClear('clearSession', ...args),
        clearCachedCloudTokens: (...args: unknown[]) => mockCloudClear('clearCachedCloudTokens', ...args),
        clearCloudIdentities: (...args: unknown[]) => mockCloudClear('clearCloudIdentities', ...args),
        clearRecentClouds: (...args: unknown[]) => mockCloudClear('clearRecentClouds', ...args),
        clearReclaimedClouds: (...args: unknown[]) => mockCloudClear('clearReclaimedClouds', ...args),
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
        getRelayToken: (...args: unknown[]) => mockGetRelayToken(...args),
        getIdentityToken: jest.fn(),
    },
}));

jest.mock('@chatic/session/store', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: (...args: unknown[]) => mockSetSessionIdentityState(...args),
    setSessionAuthenticated: (...args: unknown[]) => mockSetSessionAuthenticated(...args),
    setSelectedSiteId: jest.fn(),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: jest.fn(),
    rebuildSessionIdentity: jest.fn(),
    // The store announces KINDS now (ADR-0076 decision 2). `mockNotifySessionStateChanged` stands for
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

const mockPairedCloudsClear = jest.fn();
jest.mock('../pairing/pairedClouds', () => ({ pairedClouds: { clear: () => mockPairedCloudsClear() } }));

describe('session/auth/relaySession', () => {
    beforeEach(() => {
        // resetAllMocks (not clearAllMocks): also wipes mockResolvedValue/mockRejectedValue
        // implementations so a per-test rejection cannot leak into the next test. The defaults
        // below are re-established afterward.
        jest.resetAllMocks();
        localStorage.clear();

        mockIsNative.mockReturnValue(false);
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
        mockHasStoredRelaySession.mockReturnValue(true);

        await relaySession.initialize();

        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(1, {
            isInitialized: false,
            error: null,
        });
        expect(mockHasStoredRelaySession).toHaveBeenCalledTimes(1);
        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(2, {
            isInitialized: true,
            isAuthenticated: true,
        });
    });

    it('reports unauthenticated when no relay session is stored (guest boot)', async () => {
        mockHasStoredRelaySession.mockReturnValue(false);

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

    // The OAuth exchange must have the same shape as the other login paths: the response is the full
    // relay token view, and applyRelaySession commits it. It used to keep only the Token and drop
    // the rest, so the caller immediately hit the refresh endpoint to recover the dropped fields —
    // that was the repo's last HTTP refresh.
    it('OAuth 교환이 세션을 커밋한다 — 자격증명·relay 토큰·인증 플래그', async () => {
        const view = {
            id: 'user-1',
            $auth: { id: 'auth-1' },
            Token: { identityToken: 'jwt-1' },
        } as unknown as UserTokenView;
        mockExchangeOAuthCode.mockResolvedValue(view);

        await createCredentialsByProvider('google', 'code-1');

        expect(mockExchangeOAuthCode).toHaveBeenCalledWith({ provider: 'google', code: 'code-1' });
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

    // Desktop signs the exchange with the guest session it registered before the browser opened, so
    // the backend links that guest to the account. Admin-v2 calls without a session and keeps
    // the old endpoint.
    it('linkCurrentSession exchanges through verify-oauth-code and commits the session', async () => {
        const view = {
            id: 'user-1',
            $auth: { id: 'auth-1' },
            Token: { identityToken: 'jwt-1' },
        } as unknown as UserTokenView;
        mockVerifyOAuthCode.mockResolvedValue(view);

        await createCredentialsByProvider('google', 'code-1', { linkCurrentSession: true });

        expect(mockVerifyOAuthCode).toHaveBeenCalledWith({ provider: 'google', code: 'code-1' });
        expect(mockExchangeOAuthCode).not.toHaveBeenCalled();
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(view);
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
    });

    it('without linkCurrentSession the exchange stays on the code endpoint', async () => {
        mockExchangeOAuthCode.mockResolvedValue({ id: 'user-1', $auth: { id: 'a' }, Token: { identityToken: 'j' } });

        await createCredentialsByProvider('google', 'code-1');

        expect(mockVerifyOAuthCode).not.toHaveBeenCalled();
    });

    it('a rejected linked exchange leaves the stored session alone', async () => {
        mockVerifyOAuthCode.mockRejectedValue(Object.assign(new Error('expired'), { status: 400 }));

        await expect(createCredentialsByProvider('google', 'code-1', { linkCurrentSession: true })).rejects.toThrow(
            'expired'
        );

        expect(mockRelaySaveRelayToken).not.toHaveBeenCalled();
    });

    // ⑪ device registration: deviceId persisted through identityStore ONLY
    it('the full teardown ends the account in every cloud — tokens, uids, recent order and reclaims all go', async () => {
        // jsdom does not navigate; the redirect is not what this case is about.
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await relaySession.clearAndRedirect();

        const cleared = mockCloudClear.mock.calls.map(([name]) => name);
        expect(cleared).toEqual(
            expect.arrayContaining([
                'clearSession',
                'clearCachedCloudTokens',
                'clearCloudIdentities',
                'clearRecentClouds',
                'clearReclaimedClouds',
            ])
        );
        // The clouds a guest entered through a pairing go with the session.
        expect(mockPairedCloudsClear).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    describe('the device vault at logout', () => {
        const vaultWith = (clearOk: boolean) => {
            const vault: Record<string, string> = { 'chatic-relay-token': 'r' };
            const medium = new NativeSecureMedium({
                fallback: new MemoryMedium(),
                channel: {
                    read: async () => ({ status: 'available', values: { ...vault } }),
                    save: async () => true,
                    clear: async () => {
                        if (clearOk) Object.keys(vault).forEach(key => delete vault[key]);
                        return clearOk;
                    },
                },
            });
            return { medium, vault };
        };

        afterEach(() => sessionMedia.configure({ secret: new MemoryMedium(), plain: new MemoryMedium() }));

        it('is emptied, and the shell has confirmed it, before the page leaves', async () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            const { medium, vault } = vaultWith(true);
            await medium.hydrate();
            const plain = new MemoryMedium();
            plain.set('@chatic/web.log.pending.tab-1', '[]');
            sessionMedia.configure({ secret: medium, plain });
            signedOutAppKeys.register(['@chatic/web.log.']);

            await relaySession.clearAndRedirect();

            expect(vault).toEqual({});
            expect(plain.get('chatic-secret-logout-pending')).toBeNull();
            expect(plain.get('@chatic/web.log.pending.tab-1')).toBeNull();
            consoleError.mockRestore();
        });

        it('leaves the marker for the next boot when the shell does not confirm', async () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            const { medium } = vaultWith(false);
            await medium.hydrate();
            const plain = new MemoryMedium();
            sessionMedia.configure({ secret: medium, plain });

            await relaySession.clearAndRedirect();

            expect(plain.get('chatic-secret-logout-pending')).toBe('1');
            consoleError.mockRestore();
        });
    });

    it('persists deviceId through identityStore and writes no raw localStorage copy', () => {
        relaySession.persistDeviceId('device-42');

        expect(mockIdentitySetDeviceId).toHaveBeenCalledWith('device-42');
        // The raw `localStorage.setItem('chatic-device-id', …)` is gone: nothing read that slot — the
        // reader is useDynamicDeviceId, through the identity store.
        expect(localStorage.getItem('chatic-device-id')).toBeNull();
    });
});
