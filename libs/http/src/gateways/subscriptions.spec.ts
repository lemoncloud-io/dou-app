import { createSubscriptionHttpGateway } from './subscriptions';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    resolveEndpoint: route => `https://${route}.test`,
};

beforeEach(() => jest.clearAllMocks());

describe('createSubscriptionHttpGateway', () => {
    it('plans — GET {relay}/products/plans', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.plans({ limit: 10 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/products/plans',
            params: { limit: 10 },
        });
    });

    it('validateGoogle / validateApple — POST {iap}/validate/{platform}', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.validateGoogle({ receipt: 'r' } as never);
        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://iap.test/validate/google',
            params: {},
            body: { receipt: 'r' },
        });

        await gateway.validateApple({ receipt: 'r' } as never);
        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://iap.test/validate/apple',
            params: {},
            body: { receipt: 'r' },
        });
    });

    it('receipts — active: 1 is fixed', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.receipts({} as never);

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://iap.test/validate',
            params: { active: 1 },
        });
    });

    it('receiptDetail — GET {iap}/validate/{receiptId}', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.receiptDetail('r1');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://iap.test/validate/r1',
            params: {},
        });
    });

    it('membership — GET {relay}/memberships/0/mine', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.membership();

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/memberships/0/mine',
        });
    });

    it('validateMembership — POST {relay}/memberships/0', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.validateMembership({ planId: 'p1' } as never);

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/memberships/0',
            params: {},
            body: { planId: 'p1' },
        });
    });

    it('markDrops — POST {relay}/memberships/0/drops with the body unchanged', async () => {
        executeSignedRelayRequest.mockResolvedValue({ cloudIds: ['c1'], owned: 3, maxClouds: 2, excess: 0 });
        const gateway = createSubscriptionHttpGateway(exec);

        await expect(gateway.markDrops({ cloudIds: ['c1'] })).resolves.toEqual({
            cloudIds: ['c1'],
            owned: 3,
            maxClouds: 2,
            excess: 0,
        });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/memberships/0/drops',
            body: { cloudIds: ['c1'] },
        });
    });

    // An empty list is the "clear every mark" request, not a no-op — it must still reach the relay.
    it('markDrops — sends an empty list as is', async () => {
        executeSignedRelayRequest.mockResolvedValue({ cloudIds: [], owned: 1 });
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.markDrops({ cloudIds: [] });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith(expect.objectContaining({ body: { cloudIds: [] } }));
    });

    it('adminMemberships — GET {relay}/memberships/0/list', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.adminMemberships({ status: 'expired', page: 1 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/memberships/0/list',
            params: { status: 'expired', page: 1 },
        });
    });

    it('updateMembershipByAdmin — PUT {relay}/memberships/{userId}/admin', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.updateMembershipByAdmin('1000904', { adminStatus: 'active' }, { auto: 1 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'PUT',
            baseURL: 'https://relay.test/memberships/1000904/admin',
            params: { auto: 1 },
            body: { adminStatus: 'active' },
        });
    });

    it('refundSubscriptionByAdmin — POST {relay}/subscriptions/{userId}/refund with the reason as body', async () => {
        executeSignedRelayRequest.mockResolvedValue({ status: 'expired' });
        const gateway = createSubscriptionHttpGateway(exec);

        await expect(gateway.refundSubscriptionByAdmin('1000904', { reason: 'test refund' })).resolves.toEqual({
            status: 'expired',
        });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/subscriptions/1000904/refund',
            params: {},
            body: { reason: 'test refund' },
        });
    });

    // The console's stage switch: a refund aimed at another relay must land there, not on the
    // configured one, or the confirmation dialog would name the wrong server.
    it('refundSubscriptionByAdmin — an endpoint override replaces the configured relay', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.refundSubscriptionByAdmin('1000904', { reason: 'r' }, undefined, {
            endpoint: 'https://api.example.com/dou-d1',
        });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith(
            expect.objectContaining({ baseURL: 'https://api.example.com/dou-d1/subscriptions/1000904/refund' })
        );
    });

    it('adminClouds — GET {relay}/clouds/0/list, filtered by ownerId', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.adminClouds('1000904', { limit: 50 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/clouds/0/list',
            params: { limit: 50, ownerId: '1000904', view: 'admin', valid: 0 },
        });
    });

    // `view: 'mine'` scopes by session and `valid: 1` hides expired clouds. Neither is the
    // console's to pick, so both stay pinned even when a caller passes their own.
    it('adminClouds — view/valid stay pinned even if the caller passes their own', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.adminClouds('1000904', { view: 'mine', valid: 1 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/clouds/0/list',
            params: { ownerId: '1000904', view: 'admin', valid: 0 },
        });
    });

    // The relay only reads `userId` in its `mine` branch, so an admin list filtered by it would
    // return everyone. The gateway takes the id positionally and spells it `ownerId` itself.
    it('adminClouds — a caller-supplied userId does not become the filter', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createSubscriptionHttpGateway(exec);

        await gateway.adminClouds('1000904', { userId: '1000000' });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith(
            expect.objectContaining({ params: expect.objectContaining({ ownerId: '1000904' }) })
        );
    });

    describe('web subscription — {relay}/subscriptions/0/*', () => {
        it('reads the subscription and the cards with GET', async () => {
            executeSignedRelayRequest.mockResolvedValue({});
            const gateway = createSubscriptionHttpGateway(exec);

            await gateway.mySubscription();
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'GET',
                baseURL: 'https://relay.test/subscriptions/0/mine',
            });

            await gateway.subscriptionCards();
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'GET',
                baseURL: 'https://relay.test/subscriptions/0/cards',
            });
        });

        it('posts the commands with their bodies', async () => {
            executeSignedRelayRequest.mockResolvedValue({});
            const gateway = createSubscriptionHttpGateway(exec);
            const payer = { name: 'n', phone: '01012345678', email: 'e@x.y' };

            await gateway.issueBillingKey({ productId: 'p1' });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/issue',
                body: { productId: 'p1' },
            });

            await gateway.startSubscription({ productId: 'p1', billingKey: 'bk', ...payer });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/start',
                body: { productId: 'p1', billingKey: 'bk', ...payer },
            });

            await gateway.changeSubscription({ productId: 'p2' });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/change',
                body: { productId: 'p2' },
            });

            await gateway.addCard({ billingKey: 'bk', ...payer });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/card',
                body: { billingKey: 'bk', ...payer },
            });
        });

        it('sends an empty object with a command that takes nothing, which the relay gateway needs', async () => {
            executeSignedRelayRequest.mockResolvedValue({});
            const gateway = createSubscriptionHttpGateway(exec);

            await gateway.cancelSubscription();
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/cancel',
                body: {},
            });
        });

        it('names the card to make the default or to remove by its id', async () => {
            executeSignedRelayRequest.mockResolvedValue({});
            const gateway = createSubscriptionHttpGateway(exec);

            await gateway.setDefaultCard({ billkeyId: 'dou:dev:U1:02' });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/card-default',
                body: { billkeyId: 'dou:dev:U1:02' },
            });

            await gateway.removeCard({ billkeyId: 'dou:dev:U1:02' });
            expect(executeSignedRelayRequest).toHaveBeenLastCalledWith({
                method: 'POST',
                baseURL: 'https://relay.test/subscriptions/0/card-delete',
                body: { billkeyId: 'dou:dev:U1:02' },
            });
        });
    });
});
