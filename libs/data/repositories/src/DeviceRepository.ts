import type { DeviceStatus, ViewingType } from '@lemoncloud/chatic-sockets-lib';
import type { IDeviceSocketDataSource } from '@chatic/data-api';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface IDeviceRepository extends DisposableRepository {
    syncDevice(viewingType: ViewingType, viewingId: string): void;

    syncStatus(status: DeviceStatus): void;

    updateRemotePushMute(muted: boolean): Promise<boolean>;
}

export class DeviceRepository extends BaseRepository implements IDeviceRepository {
    constructor(
        private readonly deviceSocketDataSource: IDeviceSocketDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public syncDevice(viewingType: ViewingType, viewingId: string): void {
        this.deviceSocketDataSource.syncDevice({ viewingType, viewingId });
    }

    public syncStatus(status: DeviceStatus): void {
        this.deviceSocketDataSource.syncDevice({ status });
    }

    public async updateRemotePushMute(muted: boolean): Promise<boolean> {
        const view = await this.deviceSocketDataSource.updateRemoteDevice({ muted });
        return typeof view.muted === 'boolean' ? view.muted : muted;
    }
}
