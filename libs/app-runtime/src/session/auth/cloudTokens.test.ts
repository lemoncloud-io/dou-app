import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { issueCloudTokens, reissueCommittedCloudTokens } from './cloudTokens';

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
const mockClearPlaceOrder = jest.fn();

const mockRebuildSessionIdentity = jest.fn();
const mockNotifySessionStateChanged = jest.fn();

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
        clearPlaceOrder: (...args: unknown[]) => mockClearPlaceOrder(...args),
    },
}));

jest.mock('../store', () => ({
    rebuildSessionIdentity: (...args: unknown[]) => mockRebuildSessionIdentity(...args),
    notifySessionStateChanged: (...args: unknown[]) => mockNotifySessionStateChanged(...args),
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

const cloudToken = (identityToken: string): UserTokenView => ({ Token: { identityToken } }) as unknown as UserTokenView;

beforeEach(() => {
    jest.resetAllMocks();
    mockDelegateCloud.mockResolvedValue(delegation());
    mockExchangeToken.mockResolvedValue(cloudToken('fresh-identity'));
});

describe('issueCloudTokens', () => {
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
});

describe('reissueCommittedCloudTokens', () => {
    it('커밋된 클라우드가 없으면 아무것도 하지 않는다 (relay 전용 세션)', async () => {
        mockGetDelegationToken.mockReturnValue(null);

        await expect(reissueCommittedCloudTokens()).resolves.toBe(false);
        expect(mockDelegateCloud).not.toHaveBeenCalled();
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
    });

    it('선택된 cid가 아니라 커밋된(delegation) cid로 재발급한다 — 전환 중이면 부모가 다르다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation('committed-cloud'));
        mockDelegateCloud.mockResolvedValue(delegation('committed-cloud'));

        await expect(reissueCommittedCloudTokens()).resolves.toBe(true);

        expect(mockDelegateCloud).toHaveBeenCalledWith('committed-cloud');
    });

    it('기존 토큰 뷰에 병합한다 — 재발급이 프로필 필드를 떨어뜨리면 안 된다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());
        mockGetCloudToken.mockReturnValue({
            Token: { identityToken: 'old-identity' },
            name: 'kept-name',
        } as unknown as UserTokenView);

        await reissueCommittedCloudTokens();

        expect(mockSaveCloudToken).toHaveBeenCalledWith({
            Token: { identityToken: 'fresh-identity' },
            name: 'kept-name',
        });
    });

    it('선택 상태(cid·sid·place order)는 건드리지 않는다 — 사용자는 아무 데도 이동하지 않았다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());

        await reissueCommittedCloudTokens();

        expect(mockSaveSelectedCloudId).not.toHaveBeenCalled();
        expect(mockClearSelectedSite).not.toHaveBeenCalled();
        expect(mockClearPlaceOrder).not.toHaveBeenCalled();
    });

    it('커밋 후 identity를 재파생하고 알린다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());

        await reissueCommittedCloudTokens();

        expect(mockSaveDelegationToken).toHaveBeenCalledWith(delegation());
        expect(mockRebuildSessionIdentity).toHaveBeenCalled();
        expect(mockNotifySessionStateChanged).toHaveBeenCalled();
    });

    it('교환 실패는 던진다 — 재시도 여부는 호출자가 결정한다', async () => {
        mockGetDelegationToken.mockReturnValue(delegation());
        mockDelegateCloud.mockRejectedValue(new Error('403'));

        await expect(reissueCommittedCloudTokens()).rejects.toThrow('403');
        expect(mockSaveCloudToken).not.toHaveBeenCalled();
    });
});
