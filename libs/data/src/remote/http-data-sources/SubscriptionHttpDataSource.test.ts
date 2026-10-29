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
            refundSubscriptionByAdmin: jest.fn(),
            adminClouds: jest.fn(),
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

    // The refund takes no query params of its own; the relay's `auto`/`dryRun` defaults are what the
    // console wants, so only the body and the stage's endpoint travel.
    it('refundSubscriptionByAdmin — forwards the reason and the endpoint, and returns the raw view', async () => {
        gateway.refundSubscriptionByAdmin.mockResolvedValue({ status: 'expired' });
        const endpoint = 'https://api.example.com/dou-d1';

        await expect(
            dataSource.refundSubscriptionByAdmin('1000904', { reason: 'test refund' }, { endpoint })
        ).resolves.toEqual({ status: 'expired' });
        expect(gateway.refundSubscriptionByAdmin).toHaveBeenCalledWith(
            '1000904',
            { reason: 'test refund' },
            undefined,
            { endpoint }
        );

        await dataSource.refundSubscriptionByAdmin('1000904', { reason: 'r' });
        expect(gateway.refundSubscriptionByAdmin).toHaveBeenLastCalledWith(
            '1000904',
            { reason: 'r' },
            undefined,
            undefined
        );
    });
});
