import { reclaimOwnedClouds } from './reclaimOwnedClouds';

const mockRenewCloudSession = jest.fn();
const mockGetCommittedCloudId = jest.fn();
const mockGetDelegationToken = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();

jest.mock('./renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenewCloudSession(...args),
}));
jest.mock('../../session/store', () => ({
    getCommittedCloudId: () => mockGetCommittedCloudId(),
}));
jest.mock('../../session/store/stores', () => ({
    cloudStore: {
        getDelegationToken: () => mockGetDelegationToken(),
        peekCachedCloudTokens: (cloudId: string) => mockPeekCachedCloudTokens(cloudId),
    },
}));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** What an invite login entry stores: the delegation half carries an empty JWT. */
const inviteEntry = (cloudId: string) => ({ delegationToken: { cloudId, delegationToken: '' } });
/** What a delegate-cloud issue stores. */
const delegateIssue = (cloudId: string) => ({ delegationToken: { cloudId, delegationToken: 'signed.jwt' } });

beforeEach(() => {
    jest.resetAllMocks();
    mockGetCommittedCloudId.mockReturnValue(null);
    mockGetDelegationToken.mockReturnValue(null);
    mockPeekCachedCloudTokens.mockReturnValue(null);
    mockRenewCloudSession.mockResolvedValue(true);
});

describe('reclaimOwnedClouds', () => {
    it('re-issues an owned cloud whose cached tokens came from an invite login', async () => {
        mockPeekCachedCloudTokens.mockImplementation((cloudId: string) =>
            cloudId === 'owned-1' ? inviteEntry('owned-1') : null
        );

        await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledWith('owned-1');
    });

    it('reads the committed cloud off the session store, not the cache', async () => {
        // The cache already holds a delegate-cloud issue, but the store — what the session and its
        // socket derive from — still names the invitee.
        mockGetCommittedCloudId.mockReturnValue('owned-1');
        mockGetDelegationToken.mockReturnValue(inviteEntry('owned-1').delegationToken);
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));

        await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledWith('owned-1');
    });

    it('leaves alone an owned cloud held by a delegate-cloud issue, or not held at all', async () => {
        mockPeekCachedCloudTokens.mockImplementation((cloudId: string) =>
            cloudId === 'owned-1' ? delegateIssue('owned-1') : null
        );

        await expect(reclaimOwnedClouds(['owned-1', 'owned-2', ''])).resolves.toEqual([]);
        expect(mockRenewCloudSession).not.toHaveBeenCalled();
    });

    it('re-issues only the clouds held as an invitee, and reports only the renewals that succeeded', async () => {
        mockPeekCachedCloudTokens.mockImplementation((cloudId: string) =>
            cloudId === 'owned-2' ? delegateIssue(cloudId) : inviteEntry(cloudId)
        );
        mockRenewCloudSession.mockImplementation(async (cloudId: string) => cloudId !== 'owned-3');

        await expect(reclaimOwnedClouds(['owned-1', 'owned-2', 'owned-3'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession.mock.calls).toEqual([['owned-1'], ['owned-3']]);
    });
});
