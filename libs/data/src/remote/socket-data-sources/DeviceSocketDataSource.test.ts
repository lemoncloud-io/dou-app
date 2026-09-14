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

    it('saveDevice delegates to device.save on the active slot', async () => {
        const payload: DeviceSaveInput = { name: 'iPhone 15' };
        mockGateways.device.active.save.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.saveDevice(payload);

        expect(mockGateways.device.active.save).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('readDevice delegates to device.read on the active slot', async () => {
        const payload: DeviceReadInput = { id: 'dev-1' };
        mockGateways.device.active.read.mockResolvedValue({ id: 'dev-1', name: 'iPhone 15' } as any);

        const result = await dataSource.readDevice(payload);

        expect(mockGateways.device.active.read).toHaveBeenCalledWith(payload);
        expect(result).toEqual({ id: 'dev-1', name: 'iPhone 15' });
    });

    it('syncDevice delegates to device.sync on the active slot', async () => {
        const payload: DeviceSyncInput = { tick: 456 };

        const result = await dataSource.syncDevice(payload);

        expect(mockGateways.device.active.sync).toHaveBeenCalledWith(payload);
        expect(result).toBeUndefined();
    });

    it('updateRemoteDevice always delegates to the relay slot (the policy is pinned in the data source, regardless of an active cloud)', async () => {
        mockGateways.device.relay.updateRemote.mockResolvedValue({ muted: true } as any);

        const result = await dataSource.updateRemoteDevice({ muted: true });

        expect(mockGateways.device.relay.updateRemote).toHaveBeenCalledWith({ muted: true });
        expect(mockGateways.device.active.updateRemote).not.toHaveBeenCalled();
        expect(mockGateways.device.cloud.updateRemote).not.toHaveBeenCalled();
        expect(result).toEqual({ muted: true });
    });
});
