import type { reclaimOwnedClouds as ReclaimOwnedClouds } from './reclaimOwnedClouds';

let reclaimOwnedClouds: typeof ReclaimOwnedClouds;

const mockRenewCloudSession = jest.fn();
const mockGetCommittedCloudId = jest.fn();
const mockGetDelegationToken = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();
const mockGetUidInCloud = jest.fn();
const mockIsExchangeInFlight = jest.fn();
const mockLastIssuedForOf = jest.fn();
let mockReclaimed: Record<string, string> = {};

jest.mock('./renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenewCloudSession(...args),
}));
jest.mock('@chatic/session/store', () => ({
    getCommittedCloudId: () => mockGetCommittedCloudId(),
    getUidInCloud: (cloudId: string) => mockGetUidInCloud(cloudId),
}));
jest.mock('@chatic/session/store/stores', () => ({
    cloudStore: {
        getDelegationToken: () => mockGetDelegationToken(),
        peekCachedCloudTokens: (cloudId: string) => mockPeekCachedCloudTokens(cloudId),
        getReclaimedFor: (cloudId: string) => mockReclaimed[cloudId] ?? null,
        setReclaimedFor: (cloudId: string, relayUserId: string) => {
            mockReclaimed[cloudId] = relayUserId;
        },
    },
}));
jest.mock('@chatic/data', () => ({ RELAY_CLOUD_ID: 'default' }));
jest.mock('../session/cloudTokens', () => ({
    isInviteLoginEntry: (token?: { delegationToken?: string } | null) => token?.delegationToken === '',
    isExchangeInFlight: (cloudId: string) => mockIsExchangeInFlight(cloudId),
    lastIssuedForOf: (cloudId: string) => mockLastIssuedForOf(cloudId),
}));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const inviteEntry = (cloudId: string) => ({ delegationToken: { cloudId, delegationToken: '' } });
const delegateIssue = (cloudId: string) => ({ delegationToken: { cloudId, delegationToken: 'signed.jwt' } });

beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
    ({ reclaimOwnedClouds } = jest.requireActual('./reclaimOwnedClouds'));
    jest.useRealTimers();
    mockIsExchangeInFlight.mockReturnValue(false);
    mockLastIssuedForOf.mockReturnValue('account-1');
    mockGetCommittedCloudId.mockReturnValue(null);
    mockGetDelegationToken.mockReturnValue(null);
    mockPeekCachedCloudTokens.mockReturnValue(null);
    mockRenewCloudSession.mockResolvedValue(true);
    mockReclaimed = {};
    mockGetUidInCloud.mockImplementation((cloudId: string) => (cloudId === 'default' ? 'account-1' : null));
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

describe('reclaimOwnedClouds — owned clouds also cached as invited', () => {
    it("re-issues one held by a guest's ordinary issue, and records it for the relay user", async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledWith('owned-1');
        expect(mockReclaimed).toEqual({ 'owned-1': 'account-1' });
    });

    it('re-issues the committed one, held by the store with no cache entry', async () => {
        mockGetCommittedCloudId.mockReturnValue('owned-1');
        mockGetDelegationToken.mockReturnValue(delegateIssue('owned-1').delegationToken);

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
    });

    it('does not re-issue it twice for the same relay user', async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));
        await reclaimOwnedClouds(['owned-1'], ['owned-1']);
        mockRenewCloudSession.mockClear();

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual([]);
        expect(mockRenewCloudSession).not.toHaveBeenCalled();
    });

    it('re-issues it again for a different relay user', async () => {
        mockReclaimed = { 'owned-1': 'account-0' };
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockReclaimed).toEqual({ 'owned-1': 'account-1' });
    });

    it('records one this device holds no token for, without an exchange', async () => {
        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual([]);
        expect(mockRenewCloudSession).not.toHaveBeenCalled();
        expect(mockReclaimed).toEqual({ 'owned-1': 'account-1' });
    });

    it('leaves it unrecorded when the renewal fails, so the next trigger retries', async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));
        mockRenewCloudSession.mockResolvedValue(false);

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual([]);
        expect(mockReclaimed).toEqual({});
    });

    it('does not record it when the relay user changed while the renewal ran', async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));
        mockRenewCloudSession.mockImplementation(async () => {
            mockGetUidInCloud.mockReturnValue(null);
            return true;
        });

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockReclaimed).toEqual({});
    });

    it('does nothing with no relay user signed in', async () => {
        mockGetUidInCloud.mockReturnValue(null);
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual([]);
        expect(mockRenewCloudSession).not.toHaveBeenCalled();
        expect(mockReclaimed).toEqual({});
    });

    it('leaves alone an owned cloud with no invited row, even one held by a signed issue', async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-2'));

        await expect(reclaimOwnedClouds(['owned-2'], ['owned-1'])).resolves.toEqual([]);
        expect(mockRenewCloudSession).not.toHaveBeenCalled();
    });
});

describe('reclaimOwnedClouds — which exchange the renewal rode on', () => {
    it('does not record a renewal that joined an exchange the guest started', async () => {
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));
        mockLastIssuedForOf.mockReturnValue('guest-1');

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockReclaimed).toEqual({});
    });

    it('re-issues, rather than records, a cloud with no token but an exchange on the wire', async () => {
        mockIsExchangeInFlight.mockImplementation((cloudId: string) => cloudId === 'owned-1');

        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledWith('owned-1');
        expect(mockReclaimed).toEqual({ 'owned-1': 'account-1' });
    });
});

describe('reclaimOwnedClouds — after a failed renewal', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-21T00:00:00Z'));
        mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1'));
        mockRenewCloudSession.mockResolvedValue(false);
    });

    it('leaves the cloud alone for 30 minutes, then tries it again', async () => {
        await reclaimOwnedClouds(['owned-1'], ['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledTimes(1);

        jest.setSystemTime(new Date('2026-10-21T00:29:59Z'));
        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual([]);
        expect(mockRenewCloudSession).toHaveBeenCalledTimes(1);

        jest.setSystemTime(new Date('2026-10-21T00:30:00Z'));
        mockRenewCloudSession.mockResolvedValue(true);
        await expect(reclaimOwnedClouds(['owned-1'], ['owned-1'])).resolves.toEqual(['owned-1']);
        expect(mockRenewCloudSession).toHaveBeenCalledTimes(2);
    });

    it('backs off an invite entry the same way, and only the cloud that failed', async () => {
        mockPeekCachedCloudTokens.mockImplementation((cloudId: string) => inviteEntry(cloudId));
        mockRenewCloudSession.mockImplementation(async (cloudId: string) => cloudId !== 'owned-1');
        await reclaimOwnedClouds(['owned-1', 'owned-2']);
        mockRenewCloudSession.mockClear();

        await reclaimOwnedClouds(['owned-1', 'owned-2']);

        expect(mockRenewCloudSession.mock.calls).toEqual([['owned-2']]);
    });
});
