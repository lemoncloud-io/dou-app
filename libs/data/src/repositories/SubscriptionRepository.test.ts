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
        fetchMySubscription: jest.fn(),
        fetchSubscriptionCards: jest.fn(),
        issueBillingKey: jest.fn(),
        startSubscription: jest.fn(),
        changeSubscription: jest.fn(),
        cancelSubscription: jest.fn(),
        addCard: jest.fn(),
        setDefaultCard: jest.fn(),
        removeCard: jest.fn(),
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

    it('delegates the web subscription calls to the http data source unchanged', async () => {
        const http = createHttpDataSource();
        const payer = { name: 'n', phone: '01012345678', email: 'e@x.y' };
        http.fetchMySubscription.mockResolvedValue({ subscription: { id: 'U1:portone', status: 'trial' } });
        http.cancelSubscription.mockResolvedValue({ id: 'U1:portone', status: 'canceling' });
        const repository = new SubscriptionRepository(contextProvider as any, http as any);

        await expect(repository.fetchMySubscription()).resolves.toEqual({
            subscription: { id: 'U1:portone', status: 'trial' },
        });
        await expect(repository.cancelSubscription()).resolves.toEqual({ id: 'U1:portone', status: 'canceling' });

        await repository.issueBillingKey('p1');
        expect(http.issueBillingKey).toHaveBeenCalledWith('p1', undefined);
        await repository.startSubscription({ productId: 'p1' });
        expect(http.startSubscription).toHaveBeenCalledWith({ productId: 'p1' }, undefined);
        await repository.changeSubscription('p2');
        expect(http.changeSubscription).toHaveBeenCalledWith('p2');
        await repository.addCard({ billingKey: 'bk', ...payer });
        expect(http.addCard).toHaveBeenCalledWith({ billingKey: 'bk', ...payer }, undefined);
        await repository.setDefaultCard('c2');
        expect(http.setDefaultCard).toHaveBeenCalledWith('c2', undefined);
        await repository.removeCard('c2');
        expect(http.removeCard).toHaveBeenCalledWith('c2', undefined);
        await repository.fetchSubscriptionCards();
        expect(http.fetchSubscriptionCards).toHaveBeenCalledTimes(1);
    });

    it('forwards the sandbox query of the payer-scoped calls, and the interval of start', async () => {
        const http = createHttpDataSource();
        const repository = new SubscriptionRepository(contextProvider as any, http as any);
        const sandbox = { sandbox: 1 as const };

        await repository.issueBillingKey('p1', sandbox);
        expect(http.issueBillingKey).toHaveBeenCalledWith('p1', sandbox);
        await repository.startSubscription({ productId: 'p1' }, { sandbox: 1, interval: '10m' });
        expect(http.startSubscription).toHaveBeenCalledWith({ productId: 'p1' }, { sandbox: 1, interval: '10m' });
        await repository.fetchSubscriptionCards(sandbox);
        expect(http.fetchSubscriptionCards).toHaveBeenCalledWith(sandbox);
        await repository.addCard({ billingKey: 'bk', name: '', phone: '', email: '' }, sandbox);
        expect(http.addCard).toHaveBeenCalledWith({ billingKey: 'bk', name: '', phone: '', email: '' }, sandbox);
        await repository.setDefaultCard('c2', sandbox);
        expect(http.setDefaultCard).toHaveBeenCalledWith('c2', sandbox);
        await repository.removeCard('c2', sandbox);
        expect(http.removeCard).toHaveBeenCalledWith('c2', sandbox);
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
