import { CloudSocketDataSource } from './CloudSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DataContext } from '../../repositories/types';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: CloudSocketDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new CloudSocketDataSource(mockGateways.cloud);
    });

    it('getCloud sends the request as the cloud.get action and maps it to a domain model', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.get.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const result = await dataSource.getCloud(payload, context);

        expect(mockGateways.cloud.get).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', name: 'My Cloud', cid: 'cloud-a' });
    });

    it('updateCloud sends the request as the cloud.update action and maps it to a domain model', async () => {
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };
        mockGateways.cloud.update.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const result = await dataSource.updateCloud(payload, context);

        expect(mockGateways.cloud.update).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', cid: 'cloud-a' });
    });

    it('deleteCloud sends the request as the cloud.delete action and maps it to a domain model', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.delete.mockResolvedValue({ id: 'cloud-a' });

        const result = await dataSource.deleteCloud(payload, context);

        expect(mockGateways.cloud.delete).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', cid: 'cloud-a' });
    });
});
