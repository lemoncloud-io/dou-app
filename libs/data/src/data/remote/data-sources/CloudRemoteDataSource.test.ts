import { CloudRemoteDataSource } from './CloudRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: CloudRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new CloudRemoteDataSource(mockGateways.cloud);
    });

    it('getCloud 호출 시 cloud.get 액션으로 request가 전송되어야 한다', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.get.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const result = await dataSource.getCloud(payload);

        expect(mockGateways.cloud.get).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'cloud-a', name: 'My Cloud' });
    });

    it('updateCloud 호출 시 cloud.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };
        mockGateways.cloud.update.mockResolvedValue({ status: 'ok' });

        const result = await dataSource.updateCloud(payload);

        expect(mockGateways.cloud.update).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });

    it('deleteCloud 호출 시 cloud.delete 액션으로 request가 전송되어야 한다', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.delete.mockResolvedValue({ id: 'cloud-a', deletedAt: 1 });

        const result = await dataSource.deleteCloud(payload);

        expect(mockGateways.cloud.delete).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'cloud-a', deletedAt: 1 });
    });
});
