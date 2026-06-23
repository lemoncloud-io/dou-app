import { CloudRemoteDataSource } from './CloudRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DataContext } from '../../repositories';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: CloudRemoteDataSource;
    const context: DataContext = { cid: 'cloud-a', sid: 'site-1', uid: 'me' };

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new CloudRemoteDataSource(mockGateways.cloud);
    });

    it('getCloud 호출 시 cloud.get 액션으로 request를 전송하고 도메인 모델로 변환한다', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.get.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const result = await dataSource.getCloud(payload, context);

        expect(mockGateways.cloud.get).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', name: 'My Cloud', cid: 'cloud-a' });
    });

    it('updateCloud 호출 시 cloud.update 액션으로 request를 전송하고 도메인 모델로 변환한다', async () => {
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };
        mockGateways.cloud.update.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const result = await dataSource.updateCloud(payload, context);

        expect(mockGateways.cloud.update).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', cid: 'cloud-a' });
    });

    it('deleteCloud 호출 시 cloud.delete 액션으로 request를 전송하고 도메인 모델로 변환한다', async () => {
        const payload = { cloudId: 'cloud-a' } as any;
        mockGateways.cloud.delete.mockResolvedValue({ id: 'cloud-a' });

        const result = await dataSource.deleteCloud(payload, context);

        expect(mockGateways.cloud.delete).toHaveBeenCalledWith(payload);
        expect(result).toMatchObject({ id: 'cloud-a', cid: 'cloud-a' });
    });
});
