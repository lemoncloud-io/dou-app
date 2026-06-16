import type { DeviceSaveInput, DeviceReadInput, DeviceSyncInput, DeviceView } from '@lemoncloud/chatic-sockets-api';
import type { IDeviceRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider, RepositoryRequestOptions } from './types';
import { BaseRepository } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';

export interface IDeviceRepository {
    saveDevice(payload: DeviceSaveInput, options?: RepositoryRequestOptions): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput, options?: RepositoryRequestOptions): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput, options?: RepositoryRequestOptions): Promise<unknown>;
}

export class DeviceRepository extends BaseRepository implements IDeviceRepository {
    constructor(
        private readonly deviceRemoteDataSource: IDeviceRemoteDataSource,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public async saveDevice(payload: DeviceSaveInput, options?: RepositoryRequestOptions): Promise<DeviceView> {
        const response = await this.deviceRemoteDataSource.saveDevice(payload);
        return response as DeviceView;
    }

    public async readDevice(payload: DeviceReadInput, options?: RepositoryRequestOptions): Promise<DeviceView> {
        const response = await this.deviceRemoteDataSource.readDevice(payload);
        return response as DeviceView;
    }

    public async syncDevice(payload: DeviceSyncInput, options?: RepositoryRequestOptions): Promise<unknown> {
        return this.deviceRemoteDataSource.syncDevice(payload);
    }
}
