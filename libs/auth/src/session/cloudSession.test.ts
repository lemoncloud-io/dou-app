import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { cloudSession } from './cloudSession';

const mockIssueCloudDelegationToken = jest.fn();
const mockIssueCloudToken = jest.fn();

const mockSaveDelegationToken = jest.fn();
const mockSaveCloudToken = jest.fn();
const mockGetCachedCloudTokens = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();
const mockRecordCloudUse = jest.fn();
const mockSetCachedCloudTokens = jest.fn();
const mockSaveSelectedCloudId = jest.fn();
const mockGetSelectedCloudId = jest.fn();
const mockSaveSelectedSiteId = jest.fn();
const mockGetSelectedSiteId = jest.fn();
const mockClearSelectedSite = jest.fn();
const mockClearSession = jest.fn();
const mockGetIdentityToken = jest.fn();
const mockGetBackend = jest.fn();
const mockGetWss = jest.fn();

const mockGetActiveServerContext = jest.fn();

const mockSetSelectedSiteId = jest.fn();
const mockClearRelaySession = jest.fn();
const mockRebuildSessionIdentity = jest.fn();

const mockGetCloudSessionSnapshot = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
const mockBatch = jest.fn();

jest.mock('./authRepository', () => ({
    authRepositorySource: {
        get: () => ({
            delegateCloud: (...args: unknown[]) => mockIssueCloudDelegationToken(...args),
            exchangeToken: (...args: unknown[]) => mockIssueCloudToken(...args),
            login: jest.fn(),
            registerDevice: jest.fn(),
            verifyNativeToken: jest.fn(),
            exchangeCode: jest.fn(),
            verifyOAuthCode: jest.fn(),
        }),
    },
}));

jest.mock('@chatic/session/store/stores', () => ({
    cloudStore: {
        saveDelegationToken: (...args: unknown[]) => mockSaveDelegationToken(...args),
        getDelegationToken: jest.fn(),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCloudToken: jest.fn(),
        getCachedCloudTokens: (...args: unknown[]) => mockGetCachedCloudTokens(...args),
        peekCachedCloudTokens: (...args: unknown[]) => mockPeekCachedCloudTokens(...args),
        recordCloudUse: (...args: unknown[]) => mockRecordCloudUse(...args),
        setCachedCloudTokens: (...args: unknown[]) => mockSetCachedCloudTokens(...args),
        setCloudIdentity: jest.fn(),
        getCloudIdentity: jest.fn(() => null),
        saveSelectedCloudId: (...args: unknown[]) => mockSaveSelectedCloudId(...args),
        getSelectedCloudId: (...args: unknown[]) => mockGetSelectedCloudId(...args),
        saveSelectedSiteId: (...args: unknown[]) => mockSaveSelectedSiteId(...args),
        getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
        clearSelectedSite: (...args: unknown[]) => mockClearSelectedSite(...args),
        clearDelegationToken: jest.fn(),
        clearSession: (...args: unknown[]) => mockClearSession(...args),
        getIdentityToken: (...args: unknown[]) => mockGetIdentityToken(...args),
        getBackend: (...args: unknown[]) => mockGetBackend(...args),
        getWss: (...args: unknown[]) => mockGetWss(...args),
    },
    identityStore: {
        setDelegatorId: jest.fn(),
        setDeviceId: jest.fn(),
    },
    relayStore: {
        clearSelectedSite: jest.fn(),
        saveRelayToken: jest.fn(),
        getRelayToken: jest.fn(),
        getIdentityToken: jest.fn(),
    },
}));

jest.mock('@chatic/session/store', () => ({
    getUidInCloud: () => null,
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: jest.fn(),
    setSessionAuthenticated: jest.fn(),
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: (...args: unknown[]) => mockClearRelaySession(...args),
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
    sessionSignal: {
        emit: (...args: unknown[]) => mockNotifySessionStateChanged(...args),
        batch: (fn: () => unknown) => {
            mockBatch();
            return fn();
        },
        subscribe: jest.fn(() => () => undefined),
        registerInvalidator: jest.fn(),
    },
}));

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
}));

describe('session/auth/cloudSession', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        localStorage.clear();

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

        const result = await cloudSession.switchTo('cloud-new');

        expect(mockIssueCloudDelegationToken).toHaveBeenCalledWith('cloud-new');
        expect(mockIssueCloudToken).toHaveBeenCalledWith({
            baseURL: 'https://cloud.example.com',
            body: { delegationToken: 'delegation-token' },
        });
        expect(mockSaveDelegationToken).toHaveBeenCalled();
        expect(mockSaveCloudToken).toHaveBeenCalled();
        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-new', {
            delegationToken: {
                backend: 'https://cloud.example.com',
                wss: 'wss://cloud.example.com',
                delegationToken: 'delegation-token',
            },
            cloudToken: userToken,
        });
        expect(mockClearSelectedSite).toHaveBeenCalledTimes(1);
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        expect(mockSaveSelectedCloudId).toHaveBeenCalledTimes(2);
        expect(mockSaveSelectedCloudId).toHaveBeenCalledWith('cloud-new');
        expect(mockBatch).toHaveBeenCalledTimes(1);
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

        await cloudSession.switchTo('cloud-new');

        expect(mockIssueCloudDelegationToken).not.toHaveBeenCalled();
        expect(mockIssueCloudToken).not.toHaveBeenCalled();
        expect(mockSaveDelegationToken).toHaveBeenCalledWith(cachedDelegation);
        expect(mockSaveCloudToken).toHaveBeenCalledWith(cachedCloudToken);
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
    });

    it('records the entered cloud as the most recently used, inside the commit', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockGetCachedCloudTokens.mockReturnValue({
            delegationToken: { wss: 'wss://cloud.example.com' },
            cloudToken: { id: 'cloud-user' },
        });

        await cloudSession.switchTo('cloud-new');

        expect(mockRecordCloudUse).toHaveBeenCalledWith('cloud-new');
        const [recorded] = mockRecordCloudUse.mock.invocationCallOrder;
        expect(recorded).toBeGreaterThan(mockBatch.mock.invocationCallOrder[0]);
        expect(recorded).toBeLessThan(mockRebuildSessionIdentity.mock.invocationCallOrder[0]);
    });

    it('does not record a cloud whose exchange failed', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockIssueCloudDelegationToken.mockRejectedValue(new Error('delegate failed'));

        await expect(cloudSession.switchTo('cloud-new')).rejects.toThrow('delegate failed');

        expect(mockRecordCloudUse).not.toHaveBeenCalled();
    });

    it('with a live slot, commits the cached tokens that socket registered with — even inside the margin', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        const live = {
            delegationToken: { wss: 'wss://cloud.example.com', delegationToken: 'live-delegation' },
            cloudToken: { id: 'cloud-user', Token: { identityToken: 'live-token' } },
        };
        mockPeekCachedCloudTokens.mockReturnValue(live);
        mockGetCachedCloudTokens.mockReturnValue(null);

        await cloudSession.switchTo('cloud-new', { hasLiveSlot: true });

        expect(mockPeekCachedCloudTokens).toHaveBeenCalledWith('cloud-new');
        expect(mockIssueCloudDelegationToken).not.toHaveBeenCalled();
        expect(mockSaveDelegationToken).toHaveBeenCalledWith(live.delegationToken);
        expect(mockSaveCloudToken).toHaveBeenCalledWith(live.cloudToken);
    });

    it('commits tokens the server already issued, ahead of a live slot and the cache, and caches them', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        const issuedTokens = {
            delegationToken: { cloudId: 'cloud-new', wss: 'wss://cloud.example.com', delegationToken: '' },
            cloudToken: { id: 'invitee', Token: { identityToken: 'invitee-token' } },
        } as never;
        mockPeekCachedCloudTokens.mockReturnValue({ delegationToken: {}, cloudToken: { id: 'empty-user' } });
        mockGetCachedCloudTokens.mockReturnValue({ delegationToken: {}, cloudToken: { id: 'empty-user' } });

        await cloudSession.switchTo('cloud-new', { hasLiveSlot: true, issuedTokens });

        expect(mockIssueCloudDelegationToken).not.toHaveBeenCalled();
        expect(mockSaveDelegationToken).toHaveBeenCalledWith(expect.objectContaining({ cloudId: 'cloud-new' }));
        expect(mockSaveCloudToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'invitee' }));
        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-new', issuedTokens);
    });

    it('replaces, not merges, the token of the cloud already entered when issued tokens name another user', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        const { cloudStore } = jest.requireMock('@chatic/session/store/stores') as {
            cloudStore: { getCloudToken: jest.Mock };
        };
        cloudStore.getCloudToken.mockReturnValue({ id: 'empty-user', nick: 'Empty', Token: { identityToken: 'old' } });
        const cloudToken = { id: 'invitee', Token: { identityToken: 'invitee-token' } };

        await cloudSession.switchTo('cloud-1', {
            issuedTokens: {
                delegationToken: { cloudId: 'cloud-1', delegationToken: '', expiredAt: 0 },
                cloudToken,
            } as never,
        });

        expect(mockSaveCloudToken).toHaveBeenCalledWith(cloudToken);
    });

    it('drops the selected site when issued tokens re-enter the cloud already selected', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockGetSelectedSiteId.mockReturnValue('site-invited');

        await cloudSession.switchTo('cloud-1', {
            issuedTokens: {
                delegationToken: { cloudId: 'cloud-1', delegationToken: '', expiredAt: 0 },
                cloudToken: { id: 'invitee', Token: { identityToken: 'invitee-token' } },
            } as never,
        });

        expect(mockClearSelectedSite).toHaveBeenCalledTimes(1);
        expect(mockSaveSelectedSiteId).not.toHaveBeenCalled();
    });

    it('keeps the selected site on an ordinary re-entry of the cloud already selected', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-1');
        mockGetSelectedSiteId.mockReturnValue('site-1');
        mockIssueCloudDelegationToken.mockResolvedValue({
            backend: 'https://cloud.example.com',
            wss: 'wss://cloud.example.com',
            delegationToken: 'delegation-token',
        });
        mockIssueCloudToken.mockResolvedValue({ id: 'cloud-user', Token: { identityToken: 'cloud-token' } });

        await cloudSession.switchTo('cloud-1');

        expect(mockClearSelectedSite).not.toHaveBeenCalled();
    });

    it('with a live slot but nothing cached, falls back to the ordinary exchange', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockPeekCachedCloudTokens.mockReturnValue(null);
        mockIssueCloudDelegationToken.mockResolvedValue({ backend: 'https://b', delegationToken: 'd' });
        mockIssueCloudToken.mockResolvedValue({ id: 'cloud-user' });

        await cloudSession.switchTo('cloud-new', { hasLiveSlot: true });

        expect(mockIssueCloudDelegationToken).toHaveBeenCalledWith('cloud-new');
    });

    it('without a live slot, never reads the margin-blind copy', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockGetCachedCloudTokens.mockReturnValue({ delegationToken: {}, cloudToken: { id: 'u' } });

        await cloudSession.switchTo('cloud-new');

        expect(mockPeekCachedCloudTokens).not.toHaveBeenCalled();
    });

    it('pre-applies the target cid before the token exchange (optimistic)', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
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

        await cloudSession.switchTo('cloud-new');

        expect(cidAtExchange).toBe('cloud-new');
        expect(mockClearSelectedSite).toHaveBeenCalled();
    });

    it('rolls cid and sid back to the previous cloud when the exchange fails', async () => {
        mockGetSelectedCloudId.mockReturnValue('cloud-old');
        mockGetSelectedSiteId.mockReturnValue('site-old');
        mockIssueCloudDelegationToken.mockRejectedValue(new Error('exchange failed'));

        await expect(cloudSession.switchTo('cloud-new')).rejects.toThrow('exchange failed');

        const cidCalls = mockSaveSelectedCloudId.mock.calls.map(c => c[0]);
        expect(cidCalls).toEqual(['cloud-new', 'cloud-old']);
        expect(mockSaveSelectedSiteId).toHaveBeenCalledWith('site-old');
    });

    describe('applySelectedSite (optimistic sid primitive for the @chatic/runtime socket switch)', () => {
        it('applies the selected site through the store, without a second announcement', () => {
            cloudSession.applySelectedSite('site-new');

            expect(mockSetSelectedSiteId).toHaveBeenCalledWith('site-new');
            expect(mockNotifySessionStateChanged).not.toHaveBeenCalled();
        });

        it('clears the selected site when passed null', () => {
            cloudSession.applySelectedSite(null);

            expect(mockSetSelectedSiteId).toHaveBeenCalledWith(null);
            expect(mockNotifySessionStateChanged).not.toHaveBeenCalled();
        });
    });

    it('fully clears the cloud stores (returns to default), leaving relay intact', () => {
        cloudSession.clearStores();

        expect(mockClearSession).toHaveBeenCalledTimes(1);
        expect(mockRebuildSessionIdentity).toHaveBeenCalledTimes(1);
        expect(mockBatch).toHaveBeenCalledTimes(1);
        expect(mockClearRelaySession).not.toHaveBeenCalled();
    });
});
