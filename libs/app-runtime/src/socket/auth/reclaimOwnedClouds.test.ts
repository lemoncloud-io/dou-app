import type { reclaimOwnedClouds as ReclaimOwnedClouds } from './reclaimOwnedClouds';

// Reloaded per case: the failure backoff is module state.
let reclaimOwnedClouds: typeof ReclaimOwnedClouds;

const mockRenewCloudSession = jest.fn();
const mockGetCommittedCloudId = jest.fn();
const mockGetDelegationToken = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();
const mockGetUidInCloud = jest.fn();
const mockIsExchangeInFlight = jest.fn();
const mockLastIssuedForOf = jest.fn();
/** The reclaim records, as the store keeps them: cloud id → relay user. */
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
jest.mock('../../session/auth/cloudTokens', () => ({
    // The invite-entry mark is the real one; what an exchange was asked as is the test's to say.
    isInviteLoginEntry: (token?: { delegationToken?: string } | null) => token?.delegationToken === '',
    isExchangeInFlight: (cloudId: string) => mockIsExchangeInFlight(cloudId),
    lastIssuedForOf: (cloudId: string) => mockLastIssuedForOf(cloudId),
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
    jest.resetModules();
    ({ reclaimOwnedClouds } = jest.requireActual('./reclaimOwnedClouds'));
    jest.useRealTimers();
    mockIsExchangeInFlight.mockReturnValue(false);
    // The renewal's exchange was asked as the relay user signed in now, unless a case says otherwise.
    mockLastIssuedForOf.mockReturnValue('account-1');
    mockGetCommittedCloudId.mockReturnValue(null);
    mockGetDelegationToken.mockReturnValue(null);
    mockPeekCachedCloudTokens.mockReturnValue(null);
    mockRenewCloudSession.mockResolvedValue(true);
    mockReclaimed = {};
    // The relay user signed in now: the account that owns the clouds.
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

describe('reclaimOwnedClouds — owned clouds also cached as invited', () => {
    it("re-issues one held by a guest's ordinary issue, and records it for the relay user", async () => {
        // The guest's invite entry was renewed through delegate-cloud before the sign-in: a signed JWT.
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
            mockGetUidInCloud.mockReturnValue(null); // signed out meanwhile
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
        // The widened version of this repair re-issued every owned cloud; only the overlap is touched.
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
