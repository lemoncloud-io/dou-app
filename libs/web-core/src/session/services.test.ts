import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

const mockIssueCloudDelegationToken = jest.fn();
const mockIssueCloudToken = jest.fn();
const mockLoginRelayRequest = jest.fn();
const mockLogoutRelayRequest = jest.fn();
const mockRefreshAuthToken = jest.fn();
const mockRefreshCloudToken = jest.fn();
const mockRegisterDevice = jest.fn();
const mockVerifyNativeAppToken = jest.fn();

const mockSetUseXLemonLanguage = jest.fn();
const mockIsAuthenticated = jest.fn();
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
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../api', () => ({
    issueCloudDelegationToken: (...args: unknown[]) => mockIssueCloudDelegationToken(...args),
    issueCloudToken: (...args: unknown[]) => mockIssueCloudToken(...args),
    login: (...args: unknown[]) => mockLoginRelayRequest(...args),
    logout: (...args: unknown[]) => mockLogoutRelayRequest(...args),
    refreshAuthToken: (...args: unknown[]) => mockRefreshAuthToken(...args),
    refreshCloudToken: (...args: unknown[]) => mockRefreshCloudToken(...args),
    registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
    verifyNativeAppToken: (...args: unknown[]) => mockVerifyNativeAppToken(...args),
}));

jest.mock('../transport', () => ({
    clearRelayTransportOverrides: (...args: unknown[]) => mockClearRelayTransportOverrides(...args),
    calcSignature: (...args: unknown[]) => mockCalcSignature(...args),
    webTransport: {
        setUseXLemonLanguage: (...args: unknown[]) => mockSetUseXLemonLanguage(...args),
        isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
        buildCredentialsByToken: (...args: unknown[]) => mockBuildCredentialsByToken(...args),
        getTokenSignature: (...args: unknown[]) => mockGetTokenSignature(...args),
        logout: (...args: unknown[]) => mockLogout(...args),
    },
}));

jest.mock('./contexts', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
}));

jest.mock('./core', () => ({
    CLOUD_INVITED_BUNDLES_KEY: 'invited-cloud-bundles',
    LANGUAGE_KEY: 'i18nextLng',
    cloudCore: {
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
    identityCore: {
        setDelegatorId: (...args: unknown[]) => mockIdentitySetDelegatorId(...args),
        setDeviceId: (...args: unknown[]) => mockIdentitySetDeviceId(...args),
    },
    relayCore: {
        clearSelectedSite: (...args: unknown[]) => mockRelayClearSelectedSite(...args),
        saveRelayToken: (...args: unknown[]) => mockRelaySaveRelayToken(...args),
        getRelayToken: (...args: unknown[]) => mockRelayGetRelayToken(...args),
        getIdentityToken: (...args: unknown[]) => mockRelayGetIdentityToken(...args),
    },
    startWebCoreInit: (...args: unknown[]) => mockStartWebCoreInit(...args),
    resetWebCoreInit: (...args: unknown[]) => mockResetWebCoreInit(...args),
}));

jest.mock('./contextStore', () => ({
    setSessionIdentityState: (...args: unknown[]) => mockSetSessionIdentityState(...args),
    setSessionAuthenticated: (...args: unknown[]) => mockSetSessionAuthenticated(...args),
    setSelectedCloudId: (...args: unknown[]) => mockSetSelectedCloudId(...args),
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: (...args: unknown[]) => mockClearRelaySession(...args),
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
}));

jest.mock('./utils', () => ({
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
        info: (...args: unknown[]) => mockLoggerInfo(...args),
        error: (...args: unknown[]) => mockLoggerError(...args),
        warn: (...args: unknown[]) => mockLoggerWarn(...args),
    },
    webClient: {
        post: (...args: unknown[]) => mockPost(...args),
    },
}));

import {
    applySelectedSite,
    commitServerRefreshedToken,
    getServerAuthRegistration,
    initializeRelaySession,
    loginRelayGuestByDevice,
    loginRelayUser,
    loginRelaySocial,
    logoutCloudSession,
    persistDeviceId,
    refreshActiveCloudSession,
    refreshCloudSession,
    refreshRelaySession,
    signServerAuth,
    switchCloudSession,
    switchSiteSession,
} from './services';

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
        mockLogoutRelayRequest.mockResolvedValue({});
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

    it('initializes relay session and updates runtime state', async () => {
        await initializeRelaySession();

        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(1, {
            isInitialized: false,
            error: null,
        });
        expect(mockStartWebCoreInit).toHaveBeenCalledTimes(1);
        expect(mockSetUseXLemonLanguage).toHaveBeenCalledWith(true, 'i18nextLng');
        expect(mockIsAuthenticated).toHaveBeenCalledTimes(1);
        expect(mockSetSessionIdentityState).toHaveBeenNthCalledWith(2, {
            isInitialized: true,
            isAuthenticated: true,
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

    it('refreshes relay session, re-applies it from the refresh response, and updates selected site', async () => {
        // The refresh response is a full relay token view (flat profile fields + Token).
        const refreshView = {
            id: 'user-1',
            name: 'Relay User',
            userRole: 'user',
            Token: { identityToken: 'relay-token' },
        } as unknown as UserTokenView;
        mockRefreshAuthToken.mockResolvedValue(refreshView);

        const result = await refreshRelaySession({
            target: 'user-1@site-7',
        });

        expect(mockRefreshAuthToken).toHaveBeenCalledWith('user-1@site-7');
        // Credentials are rebuilt from the refresh response's token (no profile GET, no profile
        // shaping). syncProfile=true re-applies the session; the call returns void.
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith({ identityToken: 'relay-token' });
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
        expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-7');
        // A relay refresh must NOT touch delegatorId — it persists from guest login through refreshes.
        expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
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
        expect(mockIssueCloudToken).toHaveBeenCalledWith('https://cloud.example.com', {
            delegationToken: 'delegation-token',
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

    it('refreshes cloud session through API inputs and persists merged cloud token state', async () => {
        mockGetCloudToken.mockReturnValue({
            id: 'cloud-user',
            name: 'Old Cloud User',
            Token: { identityToken: 'old-token' },
        });
        mockGetBackend.mockReturnValue('https://cloud.example.com');
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockRefreshCloudToken.mockResolvedValue({
            id: 'cloud-user',
            name: 'New Cloud User',
            Token: { identityToken: 'new-token' },
        });

        const { refreshCloudSession } = require('./services');
        const result = await refreshCloudSession({ siteId: 'site-9' });

        expect(mockRefreshCloudToken).toHaveBeenCalledWith({
            baseURL: 'https://cloud.example.com',
            token: {
                id: 'cloud-user',
                name: 'Old Cloud User',
                Token: { identityToken: 'old-token' },
            },
            target: 'cloud-user@site-9',
        });
        expect(mockSaveCloudToken).toHaveBeenCalledWith({
            id: 'cloud-user',
            name: 'New Cloud User',
            Token: { identityToken: 'new-token' },
        });
        expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-9');
        expect(result).toEqual({
            cloudId: 'cloud-1',
            siteId: 'site-1',
            identityToken: 'identity-token',
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
        });
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

    describe('switchSiteSession (optimistic + rollback)', () => {
        const setupCloud = () => {
            mockGetCloudToken.mockReturnValue({ id: 'cloud-user', Token: { identityToken: 'old' } });
            mockGetBackend.mockReturnValue('https://cloud.example.com');
            mockGetSelectedCloudId.mockReturnValue('cloud-1');
        };

        it('pre-applies the target sid and notifies before committing', async () => {
            mockGetSelectedSiteId.mockReturnValue('site-old');
            setupCloud();
            mockRefreshCloudToken.mockResolvedValue({ id: 'cloud-user', Token: { identityToken: 'new' } });

            await switchSiteSession('site-new');

            // optimistic pre-apply + notify, then commit; no rollback
            expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-new');
            expect(mockSetSelectedSiteId).not.toHaveBeenCalledWith('site-old');
            expect(mockNotifySessionStateChanged).toHaveBeenCalled();
            expect(mockRefreshCloudToken).toHaveBeenCalledWith(
                expect.objectContaining({ target: 'cloud-user@site-new' })
            );
        });

        it('rolls the sid back to the previous site when the commit fails', async () => {
            mockGetSelectedSiteId.mockReturnValue('site-old');
            setupCloud();
            // refreshCloudToken always rejects, so the failure-only re-bootstrap retry runs once:
            // its switchCloudSession must succeed (below) before the second refresh re-rejects and
            // 'boom' finally propagates.
            mockIssueCloudDelegationToken.mockResolvedValue({
                backend: 'https://cloud.example.com',
                delegationToken: 'delegation-token',
            });
            mockIssueCloudToken.mockResolvedValue({ id: 'cloud-user', Token: { identityToken: 'new' } });
            mockRefreshCloudToken.mockRejectedValue(new Error('boom'));

            await expect(switchSiteSession('site-new')).rejects.toThrow('boom');

            const calls = mockSetSelectedSiteId.mock.calls.map(c => c[0]);
            expect(calls).toEqual(['site-new', 'site-old']); // optimistic then rollback
            expect(mockNotifySessionStateChanged).toHaveBeenCalledTimes(2);
        });

        it('no-ops when switching to the already-selected site', async () => {
            mockGetSelectedSiteId.mockReturnValue('site-1');

            await switchSiteSession('site-1');

            expect(mockSetSelectedSiteId).not.toHaveBeenCalled();
            expect(mockNotifySessionStateChanged).not.toHaveBeenCalled();
            expect(mockRefreshCloudToken).not.toHaveBeenCalled();
        });

        it('commits a relay site switch through refreshRelaySession (no cloud token required)', async () => {
            // Relay-only session: no cloud is selected and no cloud token exists.
            mockGetSelectedSiteId.mockReturnValue('site-old');
            mockGetSelectedCloudId.mockReturnValue('default');
            mockGetCloudToken.mockReturnValue(null);
            mockRelayGetRelayToken.mockReturnValue({ uid: 'relay-user' });
            mockRefreshAuthToken.mockResolvedValue({ identityToken: 'relay-token' });

            await switchSiteSession('site-new');

            // Routes to the relay refresh with a uid@sid target — never the cloud refresh.
            expect(mockRefreshAuthToken).toHaveBeenCalledWith('relay-user@site-new');
            expect(mockRefreshCloudToken).not.toHaveBeenCalled();
            expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-new');
        });

        it('site switch (syncProfile=false) persists the site-scoped token, builds creds, authes, keeps delegatorId', async () => {
            const refreshed = {
                Token: { identityToken: 'site-scoped-token' },
                uid: 'relay-user',
                userRole: 'user',
            } as unknown as UserTokenView;
            mockRefreshAuthToken.mockResolvedValue(refreshed);

            await refreshRelaySession({ target: 'relay-user@site-9', syncProfile: false });

            expect(mockRefreshAuthToken).toHaveBeenCalledWith('relay-user@site-9');
            expect(mockBuildCredentialsByToken).toHaveBeenCalledWith({ identityToken: 'site-scoped-token' });
            // The new site-scoped token is persisted — it carries the new site's identityToken and is
            // the source of truth for uid/auth. (Regression guard: this was previously dropped.)
            expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(refreshed);
            expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
            expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-9');
            // Identity is unchanged across sites — delegatorId is NOT re-derived on a site switch.
            expect(mockIdentitySetDelegatorId).not.toHaveBeenCalled();
        });

        it('rolls back and throws when a relay switch has no relay token uid', async () => {
            mockGetSelectedSiteId.mockReturnValue('site-old');
            mockGetSelectedCloudId.mockReturnValue('default');
            mockGetCloudToken.mockReturnValue(null);
            mockRelayGetRelayToken.mockReturnValue(null);

            await expect(switchSiteSession('site-new')).rejects.toThrow('No relay token uid for site auth');

            const calls = mockSetSelectedSiteId.mock.calls.map(c => c[0]);
            expect(calls).toEqual(['site-new', 'site-old']); // optimistic then rollback
            expect(mockRefreshAuthToken).not.toHaveBeenCalled();
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

    // ⑪ device registration: deviceId persisted to identityCore (and localStorage)
    it('persists deviceId to identityCore and localStorage', () => {
        persistDeviceId('device-42');

        expect(localStorage.getItem('chatic-device-id')).toBe('device-42');
        expect(mockIdentitySetDeviceId).toHaveBeenCalledWith('device-42');
    });

    // R2/⑥ relay single-flight: same target coalesces into one refresh
    it('coalesces concurrent relay refreshes with the same target', async () => {
        mockRefreshAuthToken.mockResolvedValue({ identityToken: 'relay-token' });

        await Promise.all([
            refreshRelaySession({ target: 'user-1@site-1', syncProfile: false }),
            refreshRelaySession({ target: 'user-1@site-1', syncProfile: false }),
        ]);

        expect(mockRefreshAuthToken).toHaveBeenCalledTimes(1);
    });

    // R2/⑥ relay single-flight: different targets run serially (not dropped)
    it('serializes concurrent relay refreshes with different targets', async () => {
        mockRefreshAuthToken.mockResolvedValue({ identityToken: 'relay-token' });

        await Promise.all([
            refreshRelaySession({ target: 'user-1@site-1', syncProfile: false }),
            refreshRelaySession({ target: 'user-1@site-2', syncProfile: false }),
        ]);

        expect(mockRefreshAuthToken).toHaveBeenCalledTimes(2);
        expect(mockRefreshAuthToken).toHaveBeenCalledWith('user-1@site-1');
        expect(mockRefreshAuthToken).toHaveBeenCalledWith('user-1@site-2');
    });

    // R2/⑥ cloud single-flight: same siteId coalesces into one refresh
    it('coalesces concurrent cloud refreshes with the same siteId', async () => {
        mockGetCloudToken.mockReturnValue({ id: 'cloud-user', Token: { identityToken: 'old' } });
        mockRefreshCloudToken.mockResolvedValue({ id: 'cloud-user', Token: { identityToken: 'new' } });

        await Promise.all([refreshCloudSession({ siteId: 'site-9' }), refreshCloudSession({ siteId: 'site-9' })]);

        expect(mockRefreshCloudToken).toHaveBeenCalledTimes(1);
    });

    // ② periodic cloud refresh: skips when cloud is not connected or no site session
    it('skips active cloud refresh when cloud is default', async () => {
        mockGetSelectedCloudId.mockReturnValue('default');

        await refreshActiveCloudSession();

        expect(mockRefreshCloudToken).not.toHaveBeenCalled();
    });

    it('skips active cloud refresh when there is no delegation token', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockGetDelegationToken.mockReturnValue(null);

        await refreshActiveCloudSession();

        expect(mockRefreshCloudToken).not.toHaveBeenCalled();
    });

    it('skips active cloud refresh when there is no selected site', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockGetDelegationToken.mockReturnValue({ delegationToken: 'd' });
        mockGetSelectedSiteId.mockReturnValue(null);

        await refreshActiveCloudSession();

        expect(mockRefreshCloudToken).not.toHaveBeenCalled();
    });

    // ② periodic cloud refresh: refreshes cloudToken when connected with a site session
    it('refreshes the active cloud session when connected with a site', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockGetDelegationToken.mockReturnValue({ delegationToken: 'd' });
        mockGetSelectedSiteId.mockReturnValue('site-3');
        mockGetCloudToken.mockReturnValue({ id: 'cloud-user', Token: { identityToken: 'old' } });
        mockRefreshCloudToken.mockResolvedValue({ id: 'cloud-user', Token: { identityToken: 'new' } });

        await refreshActiveCloudSession();

        expect(mockRefreshCloudToken).toHaveBeenCalledWith(expect.objectContaining({ target: 'cloud-user@site-3' }));
    });
});

// Per-server (kind-explicit) bridge helpers for the dual-socket path (multi-socket-design.md §7):
// verify the explicit-kind routing directly (no active-server context).
describe('session/services · per-server bridge helpers', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        localStorage.clear();
    });

    it('getServerAuthRegistration routes by the kind argument, not the active server', async () => {
        // relay branch: relay identity token + lemon signature authId
        mockRelayGetIdentityToken.mockReturnValue('relay-identity-token');
        mockGetTokenSignature.mockResolvedValue({ authId: 'relay-auth-id' });
        await expect(getServerAuthRegistration('relay')).resolves.toEqual({
            token: 'relay-identity-token',
            authId: 'relay-auth-id',
        });

        // cloud branch: both from the cloud token (relay signature not consulted)
        mockGetTokenSignature.mockClear();
        mockGetIdentityToken.mockReturnValue('cloud-identity-token');
        mockGetCloudToken.mockReturnValue({ Token: { authId: 'cloud-auth-id' } });
        await expect(getServerAuthRegistration('cloud')).resolves.toEqual({
            token: 'cloud-identity-token',
            authId: 'cloud-auth-id',
        });
        expect(mockGetTokenSignature).not.toHaveBeenCalled();

        // getActiveServerContext must NOT be consulted — routing is purely the kind arg
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('signServerAuth(cloud) computes over the cloud token; target does not change the signature', async () => {
        mockGetCloudToken.mockReturnValue({
            Token: { authId: 'a', accountId: 'acct', identityId: 'ident', identityToken: 'jwt' },
        });
        mockCalcSignature.mockReturnValue('cloud-sig');

        await signServerAuth('cloud', 'uid@sid');

        expect(mockCalcSignature).toHaveBeenCalledWith(
            { authId: 'a', accountId: 'acct', identityId: 'ident', identityToken: '' },
            expect.any(String)
        );
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(relay) writes the relay store even while cloud would be active (§6-6)', async () => {
        mockBuildCredentialsByToken.mockResolvedValue(undefined);
        const view = { id: 'u', Token: { identityToken: 'fresh' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('relay', view);

        // relay dual-write, no cloud store touched, and no dependence on the active context
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith(view.Token);
        expect(mockRelaySaveRelayToken).toHaveBeenCalledWith(view);
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
        expect(mockGetActiveServerContext).not.toHaveBeenCalled();
    });

    it('commitServerRefreshedToken(cloud) merges the cloud store (single write, no credential rebuild)', async () => {
        mockGetCloudToken.mockReturnValue({ id: 'u', Token: { identityToken: 'old' } });
        const view = { id: 'u', Token: { identityToken: 'new' } } as unknown as UserTokenView;

        await commitServerRefreshedToken('cloud', view);

        expect(mockSaveCloudToken).toHaveBeenCalledWith(expect.objectContaining({ Token: { identityToken: 'new' } }));
        expect(mockBuildCredentialsByToken).not.toHaveBeenCalled();
    });
});
