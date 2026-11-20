import { createMiniAppHttpGateway } from './miniapps';

import type { RelayMiniAppCreateBody, RelayMiniAppUpdateBody } from './miniapps';
import type { HttpGatewayExecutor } from './types';

const executeSignedRelayRequest = jest.fn();
const executeRelayRequest = jest.fn();

const exec: HttpGatewayExecutor = {
    executeRelayRequest,
    executeSignedRelayRequest,
    resolveEndpoint: () => 'https://relay.test',
};

beforeEach(() => jest.clearAllMocks());

describe('createMiniAppHttpGateway', () => {
    it('list — GET {relay}/miniapps/{cloudId}/list, signed, with no page or limit', async () => {
        executeSignedRelayRequest.mockResolvedValue({ list: [] });
        const gateway = createMiniAppHttpGateway(exec);

        await gateway.list('c1');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'GET',
            baseURL: 'https://relay.test/miniapps/c1/list',
        });
        expect(executeRelayRequest).not.toHaveBeenCalled();
    });

    it('create — POST {relay}/miniapps/0 with the body as given', async () => {
        executeSignedRelayRequest.mockResolvedValue({ id: 'm1' });
        const gateway = createMiniAppHttpGateway(exec);

        await gateway.create({ cloudId: 'c1', name: 'Shop', url: 'https://shop.example/', state$: { use: 'off' } });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://relay.test/miniapps/0',
            body: { cloudId: 'c1', name: 'Shop', url: 'https://shop.example/', state$: { use: 'off' } },
        });
    });

    it('update — PUT {relay}/miniapps/{id} with the body as given', async () => {
        executeSignedRelayRequest.mockResolvedValue({ id: 'm1' });
        const gateway = createMiniAppHttpGateway(exec);

        await gateway.update('m1', { state$: { use: 'on' } });

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'PUT',
            baseURL: 'https://relay.test/miniapps/m1',
            body: { state$: { use: 'on' } },
        });
    });

    // The signer signs a missing body as `{}`; a DELETE sent with none fails the gateway's signature check.
    it('remove — DELETE {relay}/miniapps/{id} with no destroy param, and the empty body it is signed with', async () => {
        executeSignedRelayRequest.mockResolvedValue({ id: 'm1' });
        const gateway = createMiniAppHttpGateway(exec);

        await gateway.remove('m1');

        expect(executeSignedRelayRequest).toHaveBeenCalledWith({
            method: 'DELETE',
            baseURL: 'https://relay.test/miniapps/m1',
            body: {},
        });
    });

    it('the bodies have no room for the admin hold', () => {
        const create: RelayMiniAppCreateBody = {
            cloudId: 'c1',
            name: 'Shop',
            url: 'https://shop.example/',
            // @ts-expect-error — `hold` is not part of an owner's body
            state$: { use: 'on', hold: '' },
        };
        // @ts-expect-error — `hold` is not part of an owner's body
        const update: RelayMiniAppUpdateBody = { state$: { use: 'on', hold: 'admin' } };

        expect(create).toBeDefined();
        expect(update).toBeDefined();
    });
});
