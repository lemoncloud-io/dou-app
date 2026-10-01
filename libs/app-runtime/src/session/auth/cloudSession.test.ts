import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { cloudSession } from './cloudSession';

const mockIssueCloudDelegationToken = jest.fn();
const mockIssueCloudToken = jest.fn();

const mockSetUseXLemonLanguage = jest.fn();
const mockIsAuthenticated = jest.fn();
const mockBuildCredentialsByToken = jest.fn();
const mockLogout = jest.fn();
const mockStartWebCoreInit = jest.fn();

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

// Per-server bridge helper deps. mockGetActiveServerContext backs the "routing ignores active
// context" assertions in the per-server suite.
const mockGetActiveServerContext = jest.fn();

const mockSetSelectedSiteId = jest.fn();
const mockClearRelaySession = jest.fn();
const mockRebuildSessionIdentity = jest.fn();

const mockGetCloudSessionSnapshot = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
/** Counts `sessionSignal.batch` — one logical use-case must be one batch (ADR-0076 decision 2). */
const mockBatch = jest.fn();
const mockIsNative = jest.fn();

// `data` is this class's only HTTP path — this is the mock seam for every session-material call.
// The argument shape is validated exactly as the repository contract has it (an object). The
// `auth/api.ts` adapter that used to rename it is gone, so this mock is now the real boundary.
jest.mock('../../data/runtime', () => ({
    getRepositories: () => ({
        auth: {
            delegateCloud: (...args: unknown[]) => mockIssueCloudDelegationToken(...args),
            exchangeToken: (...args: unknown[]) => mockIssueCloudToken(...args),
            login: jest.fn(),
            registerDevice: jest.fn(),
            verifyNativeToken: jest.fn(),
            exchangeCode: jest.fn(),
        },
    }),
}));

// Before the migration, this mock was split across four web-core modules — `./contexts`,
// `./core`, `./contextStore`, `./utils` — and has now been merged into one; they all sit behind
// the `session/store` barrel now.

jest.mock('../store/stores', () => ({
    CLOUD_INVITED_BUNDLES_KEY: 'invited-cloud-bundles',
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

jest.mock('../store', () => ({
    getCloudSessionSnapshot: (...args: unknown[]) => mockGetCloudSessionSnapshot(...args),
    getActiveServerContext: (...args: unknown[]) => mockGetActiveServerContext(...args),
    setSessionIdentityState: jest.fn(),
    setSessionAuthenticated: jest.fn(),
    setSelectedSiteId: (...args: unknown[]) => mockSetSelectedSiteId(...args),
    getSelectedSiteId: (...args: unknown[]) => mockGetSelectedSiteId(...args),
    clearRelaySession: (...args: unknown[]) => mockClearRelaySession(...args),
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
    // The store announces KINDS now (ADR-0076 decision 2). `mockNotifySessionStateChanged` stands for
    // `emit`, so the existing "was the session announced" assertions keep their meaning; `batch`
    // runs straight through because the collapsing is covered by signal.test.ts.
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

jest.mock('@chatic/bridges', () => ({
    isNative: (...args: unknown[]) => mockIsNative(...args),
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    },
    webClient: {
        post: jest.fn(),
    },
}));

describe('session/auth/cloudSession', () => {
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
        // Cloud token saved above; identity is rebuilt (uid re-derives from the active cloud token).
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        // The selected cloud id is written by `cloudStore.saveSelectedCloudId` — twice on this path
        // (the optimistic pre-apply, then the post-exchange commit). A third write through a
        // `setSelectedCloudId` store wrapper used to sit here and cost one more fan-out (ADR-0076
        // A4); that wrapper is gone, so the type system now keeps this to two.
        expect(mockSaveSelectedCloudId).toHaveBeenCalledTimes(2);
        expect(mockSaveSelectedCloudId).toHaveBeenCalledWith('cloud-new');
        // The commit is ONE batch — this is the measurement ADR-0076 decision 2 exists for. Before it the
        // success path fired the session signal eight times and seven inconsistent intermediate
        // states were observable.
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

        // Cache hit → no HTTP round trips; the committed tokens come straight from the cache.
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
        // Between the batch opening and the identity rebuild that closes the commit.
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
        // A background slot for the target is up and signing with this entry. The margin-checked read
        // would refuse it (and re-issue); the switch must commit it as it is instead.
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
        const { cloudStore } = jest.requireMock('../store/stores') as {
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
        expect(cidCalls).toEqual(['cloud-new', 'cloud-old']); // optimistic then rollback
        expect(mockSaveSelectedSiteId).toHaveBeenCalledWith('site-old'); // previous sid restored
    });

    describe('applySelectedSite (optimistic sid primitive for the app-runtime socket switch)', () => {
        // It no longer announces anything itself: `setSelectedSiteId` routes to the relay or cloud
        // store by active cloud and BOTH emit `selection` (ADR-0076 decision 2). A broadcast here was a
        // second fan-out for one write.
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

        // Clears the whole cloud session (delegation + cloud token + selected cloud/site) so
        // cloud.isActive → false and uid/activeServer fall back to relay.
        expect(mockClearSession).toHaveBeenCalledTimes(1);
        expect(mockRebuildSessionIdentity).toHaveBeenCalledTimes(1);
        // ONE batch: leaving the cloud is one observable change. The kinds themselves come from the
        // store writes inside (`clearSession` announces `cloud:token` + `selection`).
        expect(mockBatch).toHaveBeenCalledTimes(1);
        // Relay session is untouched during cloud logout.
        expect(mockClearRelaySession).not.toHaveBeenCalled();
    });
});
