import { DeviceSocketDataSource } from './DeviceSocketDataSource';
import { createMockSocketGateways, type MockSocketGatewayBundle } from '../gateways/__mocks__/MockSocketGateways';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';
describe('DeviceSocketDataSource', () => {
    let mockGateways: MockSocketGatewayBundle;
    let dataSource: DeviceSocketDataSource;

    beforeEach(() => {
        mockGateways = createMockSocketGateways();
        dataSource = new DeviceSocketDataSource(mockGateways.device);
    });

    it('saveDevice 호출 시 active 슬롯의 device.save 로 위임되어야 한다', async () => {
        const payload: DeviceSaveInput = { name: 'iPhone 15' };
        mockGateways.device.active.save.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.saveDevice(payload);

        expect(mockGateways.device.active.save).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('readDevice 호출 시 active 슬롯의 device.read 로 위임되어야 한다', async () => {
        const payload: DeviceReadInput = { id: 'dev-1' };
        mockGateways.device.active.read.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.readDevice(payload);

        expect(mockGateways.device.active.read).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('syncDevice 호출 시 active 슬롯의 device.sync 로 위임되어야 한다', async () => {
        const payload: DeviceSyncInput = { tick: 456 };

        const result = await dataSource.syncDevice(payload);

        expect(mockGateways.device.active.sync).toHaveBeenCalledWith(payload);
        expect(result).toBeUndefined();
    });

    it('updateRemoteDevice 는 항상 relay 슬롯으로 위임한다 (정책이 데이터 소스에 고정, cloud 활성 무관)', async () => {
        mockGateways.device.relay.updateRemote.mockResolvedValue({ muted: true } as any);

        const result = await dataSource.updateRemoteDevice({ muted: true });

        expect(mockGateways.device.relay.updateRemote).toHaveBeenCalledWith({ muted: true });
        expect(mockGateways.device.active.updateRemote).not.toHaveBeenCalled();
        expect(mockGateways.device.cloud.updateRemote).not.toHaveBeenCalled();
        expect(result).toEqual({ muted: true });
    });
});
