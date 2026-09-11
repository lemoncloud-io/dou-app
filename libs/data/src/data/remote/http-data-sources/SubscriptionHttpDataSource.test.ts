import { SubscriptionHttpDataSource } from './SubscriptionHttpDataSource';
import type { SubscriptionHttpDomainGateway } from '../gateways';

describe('SubscriptionHttpDataSource', () => {
    let gateway: jest.Mocked<SubscriptionHttpDomainGateway>;
    let dataSource: SubscriptionHttpDataSource;

    beforeEach(() => {
        gateway = {
            plans: jest.fn(),
            validateGoogle: jest.fn(),
            validateApple: jest.fn(),
            receipts: jest.fn(),
            receiptDetail: jest.fn(),
            membership: jest.fn(),
            validateMembership: jest.fn(),
            adminMemberships: jest.fn(),
            updateMembershipByAdmin: jest.fn(),
            adminClouds: jest.fn(),
        };
        dataSource = new SubscriptionHttpDataSource(gateway);
    });

    it('is a thin passthrough — every method forwards args and the raw result unchanged', async () => {
        gateway.plans.mockResolvedValue({ list: [] } as any);
        gateway.validateGoogle.mockResolvedValue({ ok: true } as any);
        gateway.validateApple.mockResolvedValue({ ok: true } as any);
        gateway.receipts.mockResolvedValue({ list: [] } as any);
        gateway.receiptDetail.mockResolvedValue({ ok: true } as any);
        gateway.membership.mockResolvedValue({ tier: 'pro' } as any);
        gateway.validateMembership.mockResolvedValue({ tier: 'pro' } as any);

        await expect(dataSource.fetchPlans({ limit: 5 })).resolves.toEqual({ list: [] });
        expect(gateway.plans).toHaveBeenCalledWith({ limit: 5 });

        await dataSource.validateGoogle({ receipt: 'r' } as never);
        expect(gateway.validateGoogle).toHaveBeenCalledWith({ receipt: 'r' }, undefined);

        await dataSource.validateApple({ receipt: 'r' } as never);
        expect(gateway.validateApple).toHaveBeenCalledWith({ receipt: 'r' }, undefined);

        await dataSource.fetchActiveSubscriptions({} as never);
        expect(gateway.receipts).toHaveBeenCalledWith({});

        await dataSource.fetchReceiptDetail('r1');
        expect(gateway.receiptDetail).toHaveBeenCalledWith('r1', undefined);

        await expect(dataSource.fetchMembershipInfo()).resolves.toEqual({ tier: 'pro' });

        await dataSource.validateMembership({ planId: 'p1' } as never);
        expect(gateway.validateMembership).toHaveBeenCalledWith({ planId: 'p1' }, undefined);
    });

    it('forwards the admin reads unchanged', async () => {
        gateway.adminMemberships.mockResolvedValue({ list: [] } as any);
        gateway.adminClouds.mockResolvedValue({ list: [], aggr: {} } as any);

        await expect(dataSource.fetchAdminMemberships({ status: 'expired' })).resolves.toEqual({ list: [] });
        expect(gateway.adminMemberships).toHaveBeenCalledWith({ status: 'expired' });

        await expect(dataSource.fetchAdminClouds('1000904')).resolves.toEqual({ list: [], aggr: {} });
        expect(gateway.adminClouds).toHaveBeenCalledWith('1000904', undefined);
    });

    // The `1`/absent encoding is the wire's and lives here, mirroring `CloudHttpDataSource`'s
    // `dryRun`. The console only ever says `auto: true`.
    it('spells `auto` for the wire — 1 when asked for, absent otherwise', async () => {
        gateway.updateMembershipByAdmin.mockResolvedValue({} as any);

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: 'active' }, { auto: true });
        expect(gateway.updateMembershipByAdmin).toHaveBeenCalledWith('1000904', { adminStatus: 'active' }, { auto: 1 });

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: 'active' }, { auto: false });
        expect(gateway.updateMembershipByAdmin).toHaveBeenLastCalledWith(
            '1000904',
            { adminStatus: 'active' },
            undefined
        );

        await dataSource.updateMembershipByAdmin('1000904', { adminStatus: '' });
        expect(gateway.updateMembershipByAdmin).toHaveBeenLastCalledWith('1000904', { adminStatus: '' }, undefined);
    });
});
