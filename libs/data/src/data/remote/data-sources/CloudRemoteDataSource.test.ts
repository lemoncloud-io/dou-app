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

    it('updateCloud 호출 시 cloud.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };
        mockGateways.cloud.update.mockResolvedValue({ status: 'ok' });

        const result = await dataSource.updateCloud(payload);

        expect(mockGateways.cloud.update).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ status: 'ok' });
    });
});
