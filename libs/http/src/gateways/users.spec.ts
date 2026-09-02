import { createUserHttpGateway } from './users';

import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest: jest.fn(),
    executeSignedRelayRequest,
    executeCloudRequest: jest.fn(),
    resolveEndpoint: route => `https://${route}.test`,
};

beforeEach(() => jest.clearAllMocks());

describe('createUserHttpGateway', () => {
    it('list — GET {relay}/hello/user/list, signed', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createUserHttpGateway(exec);

        await gateway.list({ page: 1 });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/hello/user/list',
            params: { page: 1 },
        });
    });

    it('tryProfile — GET {oauth}/users/0/profile, errors bubble (no swallow)', async () => {
        executeSignedRelayRequest.mockRejectedValue(new Error('boom'));
        const gateway = createUserHttpGateway(exec);

        await expect(gateway.tryProfile()).rejects.toThrow('boom');
        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://oauth.test/users/0/profile',
        });
    });

    it('updateProfile — PUT {relay}/users/{uid}', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createUserHttpGateway(exec);

        await gateway.updateProfile('u1', { name: 'x' });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'PUT',
            baseURL: 'https://relay.test/users/u1',
            body: { name: 'x' },
        });
    });

    it('registerDevice — force param only set when true', async () => {
        executeSignedRelayRequest.mockResolvedValue({});
        const gateway = createUserHttpGateway(exec);

        await gateway.registerDevice({ token: 't' } as never, { force: true });
        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/users/0/reg-dev',
            params: { force: 'true' },
            body: { token: 't' },
        });

        await gateway.registerDevice({ token: 't' } as never);
        expect(executeSignedRelayRequest).toHaveBeenLastCalledWith(expect.objectContaining({ params: undefined }));
    });
});
