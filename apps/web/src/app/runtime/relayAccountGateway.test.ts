import { runtime } from '@chatic/app-runtime';

import { getRelayAccountGateway, resetRelayAccountGateway } from './relayAccountGateway';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { connection: { RELAY_SLOT: 'default', requestOnSlot: jest.fn() } },
}));

const requestOnSlot = runtime.connection.requestOnSlot as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    resetRelayAccountGateway();
});

describe('getRelayAccountGateway', () => {
    it('sends user requests on the relay slot, whichever slot is active', async () => {
        requestOnSlot.mockResolvedValue({ id: 'relay-uid' });

        await expect(getRelayAccountGateway().profile()).resolves.toEqual({ id: 'relay-uid' });
        await getRelayAccountGateway().update({ name: 'Neo' });

        expect(requestOnSlot).toHaveBeenNthCalledWith(1, 'default', 'user.profile', null, undefined);
        expect(requestOnSlot).toHaveBeenNthCalledWith(2, 'default', 'user.update', { name: 'Neo' }, undefined);
    });

    it('builds the gateway once and reuses it', () => {
        expect(getRelayAccountGateway()).toBe(getRelayAccountGateway());
    });

    it('passes a rejection through unchanged', async () => {
        const error = new Error('503 SOCKET NOT CONNECTED');
        requestOnSlot.mockRejectedValue(error);

        await expect(getRelayAccountGateway().profile()).rejects.toBe(error);
    });
});
