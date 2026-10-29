import { SubscriptionHttpDataSource } from './SubscriptionHttpDataSource';
import type { SubscriptionHttpDomainGateway } from '../gateways';

describe('SubscriptionHttpDataSource', () => {
    let gateway: jest.Mocked<SubscriptionHttpDomainGateway>;
    let dataSource: SubscriptionHttpDataSource;

    beforeEach(() => {
        gateway = {
            plans: jest.fn(),
            membership: jest.fn(),
            validateMembership: jest.fn(),
            markDrops: jest.fn(),
            adminMemberships: jest.fn(),
            updateMembershipByAdmin: jest.fn(),
            adminClouds: jest.fn(),
            mySubscription: jest.fn(),
            subscriptionCards: jest.fn(),
            issueBillingKey: jest.fn(),
            startSubscription: jest.fn(),
            changeSubscription: jest.fn(),
            cancelSubscription: jest.fn(),
            replaceCard: jest.fn(),
            removeCard: jest.fn(),
        };
        dataSource = new SubscriptionHttpDataSource(gateway);
    });

    it('is a thin passthrough — every method forwards args and the raw result unchanged', async () => {
        gateway.plans.mockResolvedValue({ list: [] } as any);
        gateway.membership.mockResolvedValue({ tier: 'pro' } as any);
        gateway.validateMembership.mockResolvedValue({ tier: 'pro' } as any);

        await expect(dataSource.fetchPlans({ limit: 5 })).resolves.toEqual({ list: [] });
        expect(gateway.plans).toHaveBeenCalledWith({ limit: 5 });

        await expect(dataSource.fetchMembershipInfo()).resolves.toEqual({ tier: 'pro' });

        await dataSource.validateMembership({ planId: 'p1' } as never);
        expect(gateway.validateMembership).toHaveBeenCalledWith({ planId: 'p1' }, undefined);
    });

    it('markDrops — forwards the body and returns the raw result', async () => {
        gateway.markDrops.mockResolvedValue({ cloudIds: ['c1'], owned: 3, maxClouds: 2, excess: 0 });

        await expect(dataSource.markDrops({ cloudIds: ['c1'] })).resolves.toEqual({
            cloudIds: ['c1'],
            owned: 3,
            maxClouds: 2,
            excess: 0,
        });
        expect(gateway.markDrops).toHaveBeenCalledWith({ cloudIds: ['c1'] });
    });

    it('forwards the admin reads unchanged', async () => {
        gateway.adminMemberships.mockResolvedValue({ list: [] } as any);
        gateway.adminClouds.mockResolvedValue({ list: [], aggr: {} } as any);

        await expect(dataSource.fetchAdminMemberships({ status: 'expired' })).resolves.toEqual({ list: [] });
        expect(gateway.adminMemberships).toHaveBeenCalledWith({ status: 'expired' }, undefined);

        await expect(dataSource.fetchAdminClouds('1000904')).resolves.toEqual({ list: [], aggr: {} });
        expect(gateway.adminClouds).toHaveBeenCalledWith('1000904', undefined, undefined);
    });

    // The `1`/absent encoding is the wire's and lives here, mirroring `CloudHttpDataSource`'s
    // `dryRun`. The console only ever says `auto: true`.
    it('spells `auto` for the wire — 1 when asked for, absent otherwise', async () => {
        gateway.updateMembershipByAdmin.mockResolvedValue({} as any);

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: 'active' }, { auto: true });
        expect(gateway.updateMembershipByAdmin).toHaveBeenCalledWith(
            '1000904',
            { adminStatus: 'active' },
            { auto: 1 },
            { endpoint: undefined }
        );

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: 'active' }, { auto: false });
        expect(gateway.updateMembershipByAdmin).toHaveBeenLastCalledWith(
            '1000904',
            { adminStatus: 'active' },
            undefined,
            { endpoint: undefined }
        );

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: '' });
        expect(gateway.updateMembershipByAdmin).toHaveBeenLastCalledWith('1000904', { adminStatus: '' }, undefined, {
            endpoint: undefined,
        });
    });

    // The stage switch is the only reason these three take an endpoint at all; the app's own calls
    // must stay on the relay they authenticated against.
    it('passes an endpoint override through to the gateway', async () => {
        gateway.adminMemberships.mockResolvedValue({ list: [] } as any);
        gateway.adminClouds.mockResolvedValue({ list: [] } as any);
        gateway.updateMembershipByAdmin.mockResolvedValue({} as any);
        const endpoint = 'https://api.example.com/v1';

        await dataSource.fetchAdminMemberships({ page: 0 }, { endpoint });
        expect(gateway.adminMemberships).toHaveBeenCalledWith({ page: 0 }, { endpoint });

        await dataSource.fetchAdminClouds('1000904', undefined, { endpoint });
        expect(gateway.adminClouds).toHaveBeenCalledWith('1000904', undefined, { endpoint });

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: '' }, { endpoint });
        expect(gateway.updateMembershipByAdmin).toHaveBeenLastCalledWith('1000904', { adminStatus: '' }, undefined, {
            endpoint,
        });
    });

    it('forwards the web subscription calls, wrapping a product id into the body the gateway sends', async () => {
        const payer = { name: 'n', phone: '01012345678', email: 'e@x.y' };
        gateway.mySubscription.mockResolvedValue({ subscription: { id: 'U1:portone' } });
        gateway.subscriptionCards.mockResolvedValue([{ id: 'c1', isDefault: true }]);

        await expect(dataSource.fetchMySubscription()).resolves.toEqual({ subscription: { id: 'U1:portone' } });
        await expect(dataSource.fetchSubscriptionCards()).resolves.toEqual([{ id: 'c1', isDefault: true }]);

        await dataSource.issueBillingKey('p1');
        expect(gateway.issueBillingKey).toHaveBeenCalledWith({ productId: 'p1' });

        await dataSource.startSubscription({ productId: 'p1', billingKey: 'bk', ...payer });
        expect(gateway.startSubscription).toHaveBeenCalledWith({ productId: 'p1', billingKey: 'bk', ...payer });

        await dataSource.changeSubscription('p2');
        expect(gateway.changeSubscription).toHaveBeenCalledWith({ productId: 'p2' });

        await dataSource.replaceCard({ billingKey: 'bk', ...payer });
        expect(gateway.replaceCard).toHaveBeenCalledWith({ billingKey: 'bk', ...payer });

        await dataSource.cancelSubscription();
        await dataSource.removeCard();
        expect(gateway.cancelSubscription).toHaveBeenCalledTimes(1);
        expect(gateway.removeCard).toHaveBeenCalledTimes(1);
    });
});
