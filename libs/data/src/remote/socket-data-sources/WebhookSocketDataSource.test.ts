import { WebhookSocketDataSource } from './WebhookSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';

describe('WebhookSocketDataSource', () => {
    let gateways: MockSocketGatewayBundle;
    let dataSource: WebhookSocketDataSource;

    beforeEach(() => {
        gateways = createMockSocketGateways();
        dataSource = new WebhookSocketDataSource(gateways.webhook);
    });

    it('relays list as given', async () => {
        gateways.webhook.list.mockResolvedValue({ list: [{ id: 'a' }], total: 1 });
        await expect(dataSource.list({ channelId: 'C-1', page: 0, limit: 50 })).resolves.toEqual({
            list: [{ id: 'a' }],
            total: 1,
        });
        expect(gateways.webhook.list).toHaveBeenCalledWith({ channelId: 'C-1', page: 0, limit: 50 });
    });

    it('relays make-token, update and delete with their payloads untouched', async () => {
        gateways.webhook.makeToken.mockResolvedValue({ id: 'a', Token: 't' });
        gateways.webhook.update.mockResolvedValue({ id: 'a' });
        gateways.webhook.delete.mockResolvedValue({ id: 'a' });

        await dataSource.makeToken({ channelId: 'C-1', name: 'n', expiresAt: 0 });
        await dataSource.update({ id: 'a', disabled: false, expiresAt: 0 });
        await dataSource.delete({ id: 'a' });

        expect(gateways.webhook.makeToken).toHaveBeenCalledWith({ channelId: 'C-1', name: 'n', expiresAt: 0 });
        expect(gateways.webhook.update).toHaveBeenCalledWith({ id: 'a', disabled: false, expiresAt: 0 });
        expect(gateways.webhook.delete).toHaveBeenCalledWith({ id: 'a' });
    });

    it('lets a gateway rejection through', async () => {
        gateways.webhook.list.mockRejectedValue(new Error('403'));
        await expect(dataSource.list({ channelId: 'C-1' })).rejects.toThrow('403');
    });
});
