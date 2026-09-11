import { createSubscriptionHttpGateway } from './subscriptions';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    executeCloudRequest: jest.fn(),
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
});
