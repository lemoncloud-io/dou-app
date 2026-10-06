import { getCommittedSessionSiteId } from './contexts';
import { cloudStore } from './stores';

jest.mock('./stores', () => ({
    cloudStore: { getDelegationToken: jest.fn(), getCloudToken: jest.fn() },
}));

const mockedDelegation = cloudStore.getDelegationToken as jest.Mock;
const mockedCloudToken = cloudStore.getCloudToken as jest.Mock;

describe('getCommittedSessionSiteId — the place the session is on, not the selection', () => {
    beforeEach(() => jest.resetAllMocks());

    it('reads the place the committed cloud token names', () => {
        mockedDelegation.mockReturnValue({ cloudId: 'cloud-1' });
        mockedCloudToken.mockReturnValue({ $site: { id: 'site-on-token' } });

        expect(getCommittedSessionSiteId()).toBe('site-on-token');
    });

    it('is null with no committed cloud, even if a cloud token is still stored', () => {
        mockedDelegation.mockReturnValue(null);
        mockedCloudToken.mockReturnValue({ $site: { id: 'site-left-behind' } });

        expect(getCommittedSessionSiteId()).toBeNull();
    });

    it('is null for a stored token that names no place', () => {
        mockedDelegation.mockReturnValue({ cloudId: 'cloud-1' });
        mockedCloudToken.mockReturnValue({ Token: {} });

        expect(getCommittedSessionSiteId()).toBeNull();
    });
});
