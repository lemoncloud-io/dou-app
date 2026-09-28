import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { issueCloudTokens, reissueCloudTokens } from './cloudTokens';

const mockDelegateCloud = jest.fn();
const mockExchangeToken = jest.fn();

const mockGetDelegationToken = jest.fn();
const mockSaveDelegationToken = jest.fn();
const mockGetCloudToken = jest.fn();
const mockSaveCloudToken = jest.fn();
const mockGetCachedCloudTokens = jest.fn();
const mockSetCachedCloudTokens = jest.fn();
const mockGetCredential = jest.fn();
const mockSaveSelectedCloudId = jest.fn();
const mockClearSelectedSite = jest.fn();
const mockSetCloudIdentity = jest.fn();

const mockRebuildSessionIdentity = jest.fn();
const mockNotifySessionStateChanged = jest.fn();
/** Counts `sessionSignal.batch` — a re-issue must be one observable change. */
const mockBatch = jest.fn();

jest.mock('../../data/runtime', () => ({
    getRepositories: () => ({
        auth: {
            delegateCloud: (...args: unknown[]) => mockDelegateCloud(...args),
            exchangeToken: (...args: unknown[]) => mockExchangeToken(...args),
        },
    }),
}));

jest.mock('../store/stores', () => ({
    cloudStore: {
        getDelegationToken: (...args: unknown[]) => mockGetDelegationToken(...args),
        saveDelegationToken: (...args: unknown[]) => mockSaveDelegationToken(...args),
        getCloudToken: (...args: unknown[]) => mockGetCloudToken(...args),
        saveCloudToken: (...args: unknown[]) => mockSaveCloudToken(...args),
        getCachedCloudTokens: (...args: unknown[]) => mockGetCachedCloudTokens(...args),
        setCachedCloudTokens: (...args: unknown[]) => mockSetCachedCloudTokens(...args),
        getCredential: (...args: unknown[]) => mockGetCredential(...args),
        saveSelectedCloudId: (...args: unknown[]) => mockSaveSelectedCloudId(...args),
        clearSelectedSite: (...args: unknown[]) => mockClearSelectedSite(...args),
        setCloudIdentity: (...args: unknown[]) => mockSetCloudIdentity(...args),
    },
}));

jest.mock('../store', () => ({
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
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const delegation = (cloudId = 'cloud-1') => ({
    cloudId,
    delegationToken: `delegation-${cloudId}`,
    backend: 'https://cloud.example.com',
    wss: 'wss://cloud.example.com',
});

const cloudToken = (identityToken: string, uid?: string): UserTokenView =>
    ({ uid, Token: { identityToken } }) as unknown as UserTokenView;

beforeEach(() => {
    jest.resetAllMocks();
    mockDelegateCloud.mockResolvedValue(delegation());
    mockExchangeToken.mockResolvedValue(cloudToken('fresh-identity'));
});

describe('issueCloudTokens', () => {
    it('joins an exchange already in flight for the same cloud instead of starting a second one', async () => {
        // A switch and the background preparer can ask for one cloud at once; two exchanges would
        // leave the cache and whatever the loser committed or registered disagreeing.
        let finish: (value: unknown) => void = () => undefined;
        mockDelegateCloud.mockReturnValue(new Promise(resolve => (finish = resolve)));

        const first = issueCloudTokens('cloud-1', { allowCache: false });
        const second = issueCloudTokens('cloud-1', { allowCache: true });
        finish(delegation());

        const [a, b] = await Promise.all([first, second]);
        expect(mockDelegateCloud).toHaveBeenCalledTimes(1);
        expect(mockExchangeToken).toHaveBeenCalledTimes(1);
        expect(b).toBe(a);
    });

    it('runs exchanges for different clouds side by side', async () => {
        mockDelegateCloud.mockImplementation(async (cid: string) => delegation(cid));

        await Promise.all([
            issueCloudTokens('cloud-1', { allowCache: false }),
            issueCloudTokens('cloud-2', { allowCache: false }),
        ]);

        expect(mockDelegateCloud).toHaveBeenCalledTimes(2);
    });

    it('starts a fresh exchange once the previous one settled, even after a failure', async () => {
        mockDelegateCloud.mockRejectedValueOnce(new Error('delegate failed'));

        await expect(issueCloudTokens('cloud-1', { allowCache: false })).rejects.toThrow('delegate failed');
        await issueCloudTokens('cloud-1', { allowCache: false });

        expect(mockDelegateCloud).toHaveBeenCalledTimes(2);
    });

    it('캐시를 허용하면 유효한 캐시로 두 번의 HTTP 교환을 건너뛴다', async () => {
        mockGetCachedCloudTokens.mockReturnValue({
            delegationToken: delegation(),
            cloudToken: cloudToken('cached-identity'),
        });

        const issued = await issueCloudTokens('cloud-1', { allowCache: true });

        expect(issued.cloudToken.Token?.identityToken).toBe('cached-identity');
        expect(mockDelegateCloud).not.toHaveBeenCalled();
        expect(mockExchangeToken).not.toHaveBeenCalled();
    });

    it('캐시를 금지하면 캐시가 유효해도 새로 발급한다 — 만료가 임박한 사본이 바로 그 캐시다', async () => {
        mockGetCachedCloudTokens.mockReturnValue({
            delegationToken: delegation(),
            cloudToken: cloudToken('cached-identity'),
        });

        const issued = await issueCloudTokens('cloud-1', { allowCache: false });

        expect(mockGetCachedCloudTokens).not.toHaveBeenCalled();
        expect(issued.cloudToken.Token?.identityToken).toBe('fresh-identity');
        expect(mockDelegateCloud).toHaveBeenCalledWith('cloud-1');
        expect(mockExchangeToken).toHaveBeenCalledWith({
            baseURL: 'https://cloud.example.com',
            body: { delegationToken: 'delegation-cloud-1' },
        });
    });

    it('새로 발급하면 per-cloud 캐시를 갱신한다 — 캐시가 활성 토큰보다 뒤처지지 않게', async () => {
        mockGetCachedCloudTokens.mockReturnValue(null);

        await issueCloudTokens('cloud-1', { allowCache: true });

        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-1', {
            delegationToken: delegation(),
            cloudToken: cloudToken('fresh-identity'),
        });
    });

    it('records the uid the fresh token names for that cloud — the identity outlives the token', async () => {
        mockExchangeToken.mockResolvedValue(cloudToken('fresh-identity', 'uid-in-cloud-1'));

        await issueCloudTokens('cloud-1', { allowCache: false });

        expect(mockSetCloudIdentity).toHaveBeenCalledWith('cloud-1', { uid: 'uid-in-cloud-1' });
    });

    it('falls back to `id` for the uid, as the identity context does', async () => {
        mockExchangeToken.mockResolvedValue({
            id: 'user-id',
            Token: { identityToken: 't' },
        } as unknown as UserTokenView);

        await issueCloudTokens('cloud-1', { allowCache: false });

        expect(mockSetCloudIdentity).toHaveBeenCalledWith('cloud-1', { uid: 'user-id' });
    });

    it('records no identity for a token with neither uid nor id, rather than an empty one', async () => {
        await issueCloudTokens('cloud-1', { allowCache: false });

        expect(mockSetCloudIdentity).not.toHaveBeenCalled();
    });

    it('a cache replay records nothing — the identity was recorded when that entry was issued', async () => {
        mockGetCachedCloudTokens.mockReturnValue({
            delegationToken: delegation(),
            cloudToken: cloudToken('cached-identity', 'uid-cached'),
        });

        await issueCloudTokens('cloud-1', { allowCache: true });

        expect(mockSetCloudIdentity).not.toHaveBeenCalled();
    });
});

describe('reissueCloudTokens', () => {
    it('bypasses the cache and re-issues the cloud it is given — the cache holds the lapsing copy', async () => {
        mockGetDelegationToken.mockReturnValue(delegation('committed-cloud'));
        mockGetCachedCloudTokens.mockReturnValue({ delegationToken: delegation(), cloudToken: cloudToken('cached') });

        await reissueCloudTokens('committed-cloud');

        expect(mockGetCachedCloudTokens).not.toHaveBeenCalled();
        expect(mockDelegateCloud).toHaveBeenCalledWith('committed-cloud');
    });

    it('commits into the session store when the cloud is the committed one, merging the stored view', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());
        mockGetCloudToken.mockReturnValue({
            Token: { identityToken: 'old-identity' },
            name: 'kept-name',
        } as unknown as UserTokenView);

        await reissueCloudTokens('cloud-1');

        expect(mockSaveDelegationToken).toHaveBeenCalledWith(delegation());
        // A re-issue must not drop the profile fields the stored view carries.
        expect(mockSaveCloudToken).toHaveBeenCalledWith({
            Token: { identityToken: 'fresh-identity' },
            name: 'kept-name',
        });
    });

    it('선택 상태(cid·sid·place order)는 건드리지 않는다 — 사용자는 아무 데도 이동하지 않았다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());

        await reissueCloudTokens('cloud-1');

        expect(mockSaveSelectedCloudId).not.toHaveBeenCalled();
        expect(mockClearSelectedSite).not.toHaveBeenCalled();
    });

    it('커밋 후 identity를 재파생하고, 재발급 전체가 한 번의 관측 가능한 변화다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());

        await reissueCloudTokens('cloud-1');

        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        // A re-issue is not a cloud CHANGE, so observers must never see a window where only the
        // delegation token has moved.
        expect(mockBatch).toHaveBeenCalledTimes(1);
    });

    it('a cloud that is NOT committed lands in the cache only — the store belongs to another cloud', async () => {
        mockGetDelegationToken.mockReturnValue(delegation('committed-cloud'));
        mockDelegateCloud.mockResolvedValue(delegation('other-cloud'));

        const issued = await reissueCloudTokens('other-cloud');

        expect(issued.cloudToken.Token?.identityToken).toBe('fresh-identity');
        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('other-cloud', {
            delegationToken: delegation('other-cloud'),
            cloudToken: cloudToken('fresh-identity'),
        });
        expect(mockSaveDelegationToken).not.toHaveBeenCalled();
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
        expect(mockRebuildSessionIdentity).not.toHaveBeenCalled();
        expect(mockBatch).not.toHaveBeenCalled();
    });

    it('decides "committed" at write time — a switch away during the exchange keeps the store untouched', async () => {
        // Committed when the renewal starts, not any more by the time the exchange answers.
        mockGetDelegationToken.mockReturnValue(delegation('cloud-1'));
        mockDelegateCloud.mockImplementation(async () => {
            mockGetDelegationToken.mockReturnValue(delegation('cloud-2'));
            return delegation('cloud-1');
        });

        await reissueCloudTokens('cloud-1');

        expect(mockSetCachedCloudTokens).toHaveBeenCalledWith('cloud-1', expect.anything());
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
    });

    it('교환 실패는 던진다 — 재시도 여부는 호출자가 결정한다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());
        mockDelegateCloud.mockRejectedValue(new Error('403'));

        await expect(reissueCloudTokens('cloud-1')).rejects.toThrow('403');
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
    });
});
