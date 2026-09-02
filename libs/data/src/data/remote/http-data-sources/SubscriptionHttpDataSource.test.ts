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
});
