import { reclaimOwnedClouds } from './reclaimOwnedClouds';

const mockRenewCloudSession = jest.fn();
const mockGetCommittedCloudId = jest.fn();
const mockGetDelegationToken = jest.fn();
const mockPeekCachedCloudTokens = jest.fn();
const mockGetRelayUserId = jest.fn();

jest.mock('./renewCloudSession', () => ({
    renewCloudSession: (...args: unknown[]) => mockRenewCloudSession(...args),
}));
jest.mock('../../session/store', () => ({
    getCommittedCloudId: () => mockGetCommittedCloudId(),
    getRelayUserId: () => mockGetRelayUserId(),
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

/** The relay user signed in on the device in these cases — the account that owns the clouds. */
const OWNER = 'owner-1';

/** What an invite login entry stores: the delegation half carries an empty JWT. */
const inviteEntry = (cloudId: string) => ({
    delegationToken: { cloudId, delegationToken: '' },
    issuedFor: 'guest-1',
});
/** What a delegate-cloud issue stores, issued under `issuedFor` (the owner unless a case says otherwise; null = never stamped). */
const delegateIssue = (cloudId: string, issuedFor: string | null = OWNER) => ({
    delegationToken: { cloudId, delegationToken: 'signed.jwt' },
    ...(issuedFor ? { issuedFor } : {}),
});

beforeEach(() => {
    jest.resetAllMocks();
    mockGetCommittedCloudId.mockReturnValue(null);
    mockGetDelegationToken.mockReturnValue(null);
    mockPeekCachedCloudTokens.mockReturnValue(null);
    mockRenewCloudSession.mockResolvedValue(true);
    mockGetRelayUserId.mockReturnValue(OWNER);
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

    describe('an owned cloud issued under another relay user', () => {
        it('re-issues one the guest had re-issued before signing in — a real JWT, so no invite entry left', async () => {
            // The invite entry was replaced by a delegate-cloud answer for the invitee while the guest
            // was still the relay user; the owner has since signed in.
            mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1', 'guest-1'));

            await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual(['owned-1']);
            expect(mockRenewCloudSession).toHaveBeenCalledWith('owned-1');
        });

        it('re-issues an entry written before the mark existed, once — the renewal stamps it', async () => {
            mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1', null));

            await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual(['owned-1']);
        });

        it('leaves one issued to the relay user signed in now', async () => {
            mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1', OWNER));

            await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual([]);
            expect(mockRenewCloudSession).not.toHaveBeenCalled();
        });

        it('reclaims nothing with no relay user signed in — there is no one to compare against', async () => {
            mockGetRelayUserId.mockReturnValue(null);
            mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1', 'guest-1'));

            await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual([]);
            expect(mockRenewCloudSession).not.toHaveBeenCalled();
        });

        it('does not start a second renewal for a cloud whose renewal is still under way', async () => {
            mockPeekCachedCloudTokens.mockReturnValue(delegateIssue('owned-1', 'guest-1'));
            let finish: (ok: boolean) => void = () => undefined;
            mockRenewCloudSession.mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)));

            const first = reclaimOwnedClouds(['owned-1']);
            await expect(reclaimOwnedClouds(['owned-1'])).resolves.toEqual([]);
            finish(true);

            await expect(first).resolves.toEqual(['owned-1']);
            expect(mockRenewCloudSession).toHaveBeenCalledTimes(1);
        });
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
