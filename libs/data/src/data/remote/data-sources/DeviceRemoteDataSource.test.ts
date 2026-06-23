import { DeviceRemoteDataSource } from './DeviceRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';
describe('DeviceRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let dataSource: DeviceRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        dataSource = new DeviceRemoteDataSource(mockGateways.device);
    });

    it('saveDevice 호출 시 device.save 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceSaveInput = { name: 'iPhone 15' };
        mockGateways.device.save.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.saveDevice(payload);

        expect(mockGateways.device.save).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('readDevice 호출 시 device.read 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceReadInput = { id: 'dev-1' };
        mockGateways.device.read.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.readDevice(payload);

        expect(mockGateways.device.read).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('syncDevice 호출 시 device.sync 액션으로 request가 전송되어야 한다', async () => {
        const payload: DeviceSyncInput = { tick: 456 };

        const result = await dataSource.syncDevice(payload);

        expect(mockGateways.device.sync).toHaveBeenCalledWith(payload);
        expect(result).toBeUndefined();
    });
});
