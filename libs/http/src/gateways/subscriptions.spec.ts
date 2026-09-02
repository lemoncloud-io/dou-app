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
});
