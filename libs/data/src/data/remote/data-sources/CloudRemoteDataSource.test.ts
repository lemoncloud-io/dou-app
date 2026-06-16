import { CloudRemoteDataSource } from './CloudRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { CloudUpdateInput } from '@lemoncloud/chatic-sockets-api';

describe('CloudRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let dataSource: CloudRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        dataSource = new CloudRemoteDataSource(mockClient);
    });

    it('updateCloud 호출 시 cloud.update 액션으로 request가 전송되어야 한다', async () => {
        const payload: CloudUpdateInput = { cloudId: 'cloud-a', name: 'My Cloud' };
        mockClient.request.mockResolvedValue({ status: 'ok' });

        const result = await dataSource.updateCloud(payload);

        expect(mockClient.request).toHaveBeenCalledWith('cloud.update', payload);
        expect(result).toEqual({ status: 'ok' });
    });
});
