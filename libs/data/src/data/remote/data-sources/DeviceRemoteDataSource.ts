import type { ISocketClient } from '../sockets';
import type { DeviceReadInput, DeviceSaveInput, DeviceSyncInput, DeviceView } from '@lemoncloud/chatic-sockets-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';

export interface IDeviceRemoteDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): Promise<unknown>;
    /** 인바운드 모델 이벤트를 처리합니다. */
    handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void;
}

export class DeviceRemoteDataSource implements IDeviceRemoteDataSource {
    constructor(
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly client: ISocketClient
    ) {}

    public async saveDevice(payload: DeviceSaveInput): Promise<DeviceView> {
        return this.client.request('device.save', payload) as Promise<DeviceView>;
    }

    public async readDevice(payload: DeviceReadInput): Promise<DeviceView> {
        return this.client.request('device.read', payload) as Promise<DeviceView>;
    }

    public async syncDevice(payload: DeviceSyncInput): Promise<unknown> {
        return this.client.request('device.sync', payload);
    }

    public handleModelEvent(action: 'create' | 'update' | 'delete', data: any): void {
        const eventName = `device:${action}` as 'device:create' | 'device:update' | 'device:delete';
        this.domainEventBus.emit(eventName, {
            data,
        });
    }
}
