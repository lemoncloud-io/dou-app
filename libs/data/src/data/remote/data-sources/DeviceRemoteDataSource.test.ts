import { DeviceRemoteDataSource } from './DeviceRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';

describe('DeviceRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let dataSource: DeviceRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        dataSource = new DeviceRemoteDataSource(mockClient);
    });

    it('saveDevice 호출 시 device.save 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceSaveInput = { name: 'iPhone 15' };
        mockClient.request.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' });

        const result = await dataSource.saveDevice(payload);

        expect(mockClient.request).toHaveBeenCalledWith('device.save', payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('readDevice 호출 시 device.read 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceReadInput = { id: 'dev-1' };
        mockClient.request.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' });

        const result = await dataSource.readDevice(payload);

        expect(mockClient.request).toHaveBeenCalledWith('device.read', payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('syncDevice 호출 시 device.sync 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceSyncInput = { tick: 456 };
        mockClient.request.mockResolvedValue(null);

        const result = await dataSource.syncDevice(payload);

        expect(mockClient.request).toHaveBeenCalledWith('device.sync', payload);
        expect(result).toBeNull();
    });
});
