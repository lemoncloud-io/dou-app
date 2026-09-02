import { createCloudHttpGateway } from './clouds';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    executeCloudRequest: jest.fn(),
    resolveEndpoint: () => 'https://relay.test',
};

beforeEach(() => jest.clearAllMocks());

describe('createCloudHttpGateway', () => {
    it('list — view: mine is fixed even if the caller passes their own view', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createCloudHttpGateway(exec);

        await gateway.list({ view: 'other', page: 2 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/clouds/0/list',
            params: { view: 'mine', page: 2 },
        });
    });

    it('update — PUT {relay}/clouds/{cloudId}', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createCloudHttpGateway(exec);

        await gateway.update('c1', { name: 'x' } as never);

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'PUT',
            baseURL: 'https://relay.test/clouds/c1',
            body: { name: 'x' },
        });
    });

    it('make — auto: 1 is fixed', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createCloudHttpGateway(exec);

        await gateway.make({ email: 'a@b.com' } as never);

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/clouds/0/make',
            params: { auto: 1 },
            body: { email: 'a@b.com' },
        });
    });

    it('release — allowRecordError: true so a 200 body carrying its own `error` column is not rejected', async () => {
        executeSignedRelayRequest.mockResolvedValue({ id: '1', error: '.accountNo is invalid' });
        const gateway = createCloudHttpGateway(exec);

        await gateway.release('c1');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/clouds/c1/release',
            body: {},
            params: {},
            allowRecordError: true,
        });
    });

    it('verifyEmail — POST {relay}/clouds/0/verify-email', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createCloudHttpGateway(exec);

        await gateway.verifyEmail({ email: 'a@b.com' } as never, { dryRun: true });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/clouds/0/verify-email',
            params: { dryRun: true },
            body: { email: 'a@b.com' },
        });
    });
});
