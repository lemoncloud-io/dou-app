import { DeviceRemoteDataSource } from './DeviceRemoteDataSource';
import { MockSocketClient } from '../sockets/__mocks__/MockSocketClient';
import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';

describe('DeviceRemoteDataSource', () => {
    let mockClient: MockSocketClient;
    let mockEventBus: jest.Mocked<IEventBus<DomainEventMap>>;
    let dataSource: DeviceRemoteDataSource;

    beforeEach(() => {
        mockClient = new MockSocketClient();
        mockEventBus = { emit: jest.fn(), on: jest.fn(), off: jest.fn() } as any;
        dataSource = new DeviceRemoteDataSource(mockEventBus, mockClient);
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
