import { SubscriptionRepository } from './SubscriptionRepository';

describe('SubscriptionRepository', () => {
    const contextProvider = { getContext: () => ({ cid: 'cloud-a', uid: 'me' }), setContext: () => undefined };
    const createHttpDataSource = () => ({
        fetchPlans: jest.fn(),
        fetchMembershipInfo: jest.fn(),
        validateMembership: jest.fn(),
        markDrops: jest.fn(),
        fetchAdminMemberships: jest.fn(),
        updateMembershipByAdmin: jest.fn(),
        refundSubscriptionByAdmin: jest.fn(),
        fetchAdminClouds: jest.fn(),
    });

    it('is remote-only — constructs with no local/socket data source, matching AuthRepository/DeviceRepository', () => {
        expect(() => new SubscriptionRepository(contextProvider as any)).not.toThrow();
    });

    it('throws a clear error on every method when ISubscriptionHttpDataSource is not injected', async () => {
        const repository = new SubscriptionRepository(contextProvider as any);

        await expect(repository.fetchPlans()).rejects.toThrow('not injected');
        await expect(repository.fetchMembershipInfo()).rejects.toThrow('not injected');
        await expect(repository.markDrops({ cloudIds: [] })).rejects.toThrow('not injected');
        await expect(repository.refundSubscriptionByAdmin('1000904', { reason: 'r' })).rejects.toThrow('not injected');
    });

    it('delegates every method to the injected http data source', async () => {
        const http = createHttpDataSource();
        http.fetchPlans.mockResolvedValue({ list: [{ id: 'p1' }] });
        http.fetchMembershipInfo.mockResolvedValue({ tier: 'pro' });
        const repository = new SubscriptionRepository(contextProvider as any, http as any);

        await expect(repository.fetchPlans({ limit: 5 })).resolves.toEqual({ list: [{ id: 'p1' }] });
        expect(http.fetchPlans).toHaveBeenCalledWith({ limit: 5 });

        await expect(repository.fetchMembershipInfo()).resolves.toEqual({ tier: 'pro' });
    });

    it('markDrops — delegates to the http data source with the body unchanged', async () => {
        const http = createHttpDataSource();
        http.markDrops.mockResolvedValue({ cloudIds: ['c1', 'c2'], owned: 4, maxClouds: 2, excess: 0 });
        const repository = new SubscriptionRepository(contextProvider as any, http as any);

        await expect(repository.markDrops({ cloudIds: ['c1', 'c2'] })).resolves.toEqual({
            cloudIds: ['c1', 'c2'],
            owned: 4,
            maxClouds: 2,
            excess: 0,
        });
        expect(http.markDrops).toHaveBeenCalledWith({ cloudIds: ['c1', 'c2'] });
    });

    it('refundSubscriptionByAdmin — delegates the user, reason and endpoint unchanged', async () => {
        const http = createHttpDataSource();
        http.refundSubscriptionByAdmin.mockResolvedValue({ status: 'expired' });
        const repository = new SubscriptionRepository(contextProvider as any, http as any);
        const opts = { endpoint: 'https://api.example.com/dou-d1' };

        await expect(repository.refundSubscriptionByAdmin('1000904', { reason: 'test refund' }, opts)).resolves.toEqual(
            {
                status: 'expired',
            }
        );
        expect(http.refundSubscriptionByAdmin).toHaveBeenCalledWith('1000904', { reason: 'test refund' }, opts);
    });

    it('dispose() is a no-op inherited from BaseRepository (nothing acquired to release)', () => {
        const repository = new SubscriptionRepository(contextProvider as any);
        expect(() => repository.dispose()).not.toThrow();
    });
});
