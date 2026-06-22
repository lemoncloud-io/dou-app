import { DeviceRemoteDataSource } from './DeviceRemoteDataSource';
import { createMockRemoteGateways, type MockRemoteGatewayBundle } from '../gateways/__mocks__/MockRemoteGateways';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
describe('DeviceRemoteDataSource', () => {
    let mockGateways: MockRemoteGatewayBundle;
    let mockEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: DeviceRemoteDataSource;

    beforeEach(() => {
        mockGateways = createMockRemoteGateways();
        mockEventBus = { emit: jest.fn(), on: jest.fn(), off: jest.fn() } as any;
        dataSource = new DeviceRemoteDataSource(mockEventBus, mockGateways.device);
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
        expect(result).toBeNull();
    });

    it('handleModelEvent("create", data) 호출 시 domainEventBus에 device:create를 emit 해야 한다', () => {
        const data = { id: 'dev-1' };
        dataSource.handleModelEvent('create', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('device:create', { data });
    });

    it('handleModelEvent("update", data) 호출 시 domainEventBus에 device:update를 emit 해야 한다', () => {
        const data = { id: 'dev-1' };
        dataSource.handleModelEvent('update', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('device:update', { data });
    });

    it('handleModelEvent("delete", data) 호출 시 domainEventBus에 device:delete를 emit 해야 한다', () => {
        const data = { id: 'dev-1' };
        dataSource.handleModelEvent('delete', data);
        expect(mockEventBus.emit).toHaveBeenCalledWith('device:delete', { data });
    });
});
