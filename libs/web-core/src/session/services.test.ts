import type { UserProfile$, UserTokenView } from '@lemoncloud/chatic-backend-api';

const mockFetchProfile = jest.fn();
const mockIssueCloudDelegationToken = jest.fn();
const mockIssueCloudToken = jest.fn();
const mockLoginRelayRequest = jest.fn();
const mockLoginWithInviteCodeRequest = jest.fn();
const mockLogoutRelayRequest = jest.fn();
const mockRefreshAuthToken = jest.fn();
const mockRefreshCloudToken = jest.fn();
const mockRegisterDevice = jest.fn();
const mockTryFetchProfile = jest.fn();
const mockUpdateProfile = jest.fn();
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

const mockIdentitySetIsInvited = jest.fn();
const mockIdentitySetOAuthProvider = jest.fn();
const mockIdentityGetOAuthProvider = jest.fn();
const mockIdentitySetDelegatorId = jest.fn();
const mockIdentitySetDeviceId = jest.fn();

const mockSetSessionIdentityState = jest.fn();
const mockSetSessionProfile = jest.fn();
const mockSetSessionAuthenticated = jest.fn();
const mockSetSessionCloudProfile = jest.fn();
const mockSetSelectedCloudId = jest.fn();
const mockSetSelectedSiteId = jest.fn();
const mockClearSessionProfile = jest.fn();
const mockClearSessionCloudProfile = jest.fn();

const mockGetCloudSessionSnapshot = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
const mockIsNative = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../api', () => ({
    fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    issueCloudDelegationToken: (...args: unknown[]) => mockIssueCloudDelegationToken(...args),
    issueCloudToken: (...args: unknown[]) => mockIssueCloudToken(...args),
    login: (...args: unknown[]) => mockLoginRelayRequest(...args),
    loginWithInviteCode: (...args: unknown[]) => mockLoginWithInviteCodeRequest(...args),
    logout: (...args: unknown[]) => mockLogoutRelayRequest(...args),
    refreshAuthToken: (...args: unknown[]) => mockRefreshAuthToken(...args),
    refreshCloudToken: (...args: unknown[]) => mockRefreshCloudToken(...args),
    registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
    tryFetchProfile: (...args: unknown[]) => mockTryFetchProfile(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    verifyNativeAppToken: (...args: unknown[]) => mockVerifyNativeAppToken(...args),
}));

jest.mock('../transport', () => ({
    clearRelayTransportOverrides: (...args: unknown[]) => mockClearRelayTransportOverrides(...args),
    webTransport: {
        setUseXLemonLanguage: (...args: unknown[]) => mockSetUseXLemonLanguage(...args),
        isAuthenticated: (...args: unknown[]) => mockIsAuthenticated(...args),
        buildCredentialsByToken: (...args: unknown[]) => mockBuildCredentialsByToken(...args),
        logout: (...args: unknown[]) => mockLogout(...args),
    },
}));

jest.mock('./contexts', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
}));

jest.mock('./core', () => ({
    CLOUD_INVITED_BUNDLES_KEY: 'invited-cloud-bundles',
    LANGUAGE_KEY: 'i18nextLng',
    cloudCore: {
        saveDelegationToken: (...args: unknown[]) => mockSaveDelegationToken(...args),
        getDelegationToken: (...args: unknown[]) => mockGetDelegationToken(...args),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCloudToken: (...args: unknown[]) => mockGetCloudToken(...args),
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
        setIsInvited: (...args: unknown[]) => mockIdentitySetIsInvited(...args),
        setOAuthProvider: (...args: unknown[]) => mockIdentitySetOAuthProvider(...args),
        getOAuthProvider: (...args: unknown[]) => mockIdentityGetOAuthProvider(...args),
        setDelegatorId: (...args: unknown[]) => mockIdentitySetDelegatorId(...args),
        setDeviceId: (...args: unknown[]) => mockIdentitySetDeviceId(...args),
    },
    relayCore: {
        clearSelectedSite: (...args: unknown[]) => mockRelayClearSelectedSite(...args),
    },
    startWebCoreInit: (...args: unknown[]) => mockStartWebCoreInit(...args),
    resetWebCoreInit: (...args: unknown[]) => mockResetWebCoreInit(...args),
}));

jest.mock('./contextStore', () => ({
    setSessionIdentityState: (...args: unknown[]) => mockSetSessionIdentityState(...args),
    setSessionProfile: (...args: unknown[]) => mockSetSessionProfile(...args),
    setSessionAuthenticated: (...args: unknown[]) => mockSetSessionAuthenticated(...args),
    setSessionCloudProfile: (...args: unknown[]) => mockSetSessionCloudProfile(...args),
    setSelectedCloudId: (...args: unknown[]) => mockSetSelectedCloudId(...args),
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
    clearSessionProfile: (...args: unknown[]) => mockClearSessionProfile(...args),
    clearSessionCloudProfile: (...args: unknown[]) => mockClearSessionCloudProfile(...args),
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
    },
    webClient: {
        post: (...args: unknown[]) => mockPost(...args),
    },
}));

import {
    initializeRelaySession,
    loginRelayGuestByDevice,
    loginRelayUser,
    loginRelaySocial,
    loginWithInviteCode,
    logoutCloudSession,
    refreshRelaySession,
    switchCloudSession,
} from './services';

describe('session/services', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
            isOnMobileApp: false,
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
        expect(mockIdentitySetIsInvited).toHaveBeenCalledWith(false);
        expect(mockIdentitySetOAuthProvider).toHaveBeenCalledWith(null);
        expect(mockSetSessionProfile).toHaveBeenCalledWith({
            uid: 'guest-1',
            $user: { userRole: 'guest', name: 'Guest' },
        });
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
        expect(mockIdentitySetIsInvited).toHaveBeenCalledWith(false);
        expect(mockIdentitySetOAuthProvider).toHaveBeenCalledWith('google');
        expect(mockSetSessionProfile).toHaveBeenCalledWith({
            uid: 'user-1',
            $user: { userRole: 'user', name: 'User' },
        });
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
        expect(mockSetSessionProfile).toHaveBeenCalledWith({
            uid: 'user-2',
            $user: { userRole: 'user', name: 'Relay User' },
        });
    });

    it('preserves invite identity state during invite login', async () => {
        const tokenView = {
            Token: { identityToken: 'relay-token' },
            uid: 'invite-user',
            $user: { userRole: 'user', name: 'Invite User' },
        } as unknown as UserTokenView;
        mockLoginWithInviteCodeRequest.mockResolvedValue(tokenView);

        await loginWithInviteCode({
            code: 'invt:1:abc',
            delegatorId: 'guest-42',
            backend: 'https://relay.example.com',
        });

        expect(mockLoginWithInviteCodeRequest).toHaveBeenCalledWith(
            'invt:1:abc',
            'guest-42',
            'https://relay.example.com'
        );
        expect(mockIdentitySetIsInvited).toHaveBeenCalledWith(true);
        expect(mockIdentitySetOAuthProvider).toHaveBeenCalledWith(null);
        expect(mockIdentitySetDelegatorId).toHaveBeenCalledWith('guest-42');
    });

    it('refreshes relay session and updates selected site when target is provided', async () => {
        const profile = {
            uid: 'user-1',
            $user: { userRole: 'user', name: 'Relay User' },
        } as unknown as UserProfile$;
        mockRefreshAuthToken.mockResolvedValue({ identityToken: 'relay-token' });
        mockTryFetchProfile.mockResolvedValue(profile);

        const result = await refreshRelaySession({
            target: 'user-1@site-7',
        });

        expect(result).toBe(profile);
        expect(mockRefreshAuthToken).toHaveBeenCalledWith('user-1@site-7');
        expect(mockBuildCredentialsByToken).toHaveBeenCalledWith({ identityToken: 'relay-token' });
        expect(mockSetSessionAuthenticated).toHaveBeenCalledWith(true);
        expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-7');
        expect(mockSetSessionProfile).toHaveBeenCalledWith(profile);
        expect(mockFetchProfile).not.toHaveBeenCalled();
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
        expect(mockClearSelectedSite).toHaveBeenCalledTimes(1);
        expect(mockClearPlaceOrder).toHaveBeenCalledWith('cloud-new');
        expect(mockSetSessionCloudProfile).toHaveBeenCalledWith({
            id: 'cloud-user',
            uid: 'cloud-user',
            name: 'Cloud User',
            photo: 'photo',
            $user: {
                id: 'cloud-user',
                uid: 'cloud-user',
                name: 'Cloud User',
                photo: 'photo',
            },
        });
        expect(mockSetSelectedCloudId).toHaveBeenCalledWith('cloud-new');
        expect(result).toEqual({
            cloudId: 'cloud-1',
            siteId: 'site-1',
            identityToken: 'identity-token',
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
        });
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

    it('clears only cloud-scoped state during cloud logout', () => {
        logoutCloudSession();

        expect(mockClearDelegationToken).toHaveBeenCalledTimes(1);
        expect(mockClearSessionCloudProfile).toHaveBeenCalledTimes(1);
        expect(mockNotifySessionStateChanged).toHaveBeenCalledTimes(1);
        expect(mockClearSessionProfile).not.toHaveBeenCalled();
    });
});
