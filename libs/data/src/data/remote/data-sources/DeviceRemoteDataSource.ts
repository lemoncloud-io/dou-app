import type { ISocketClient } from '../sockets/clients';
import type { DeviceReadInput, DeviceSaveInput, DeviceSyncInput, DeviceView } from '@lemoncloud/chatic-sockets-api';

export interface IDeviceRemoteDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): Promise<unknown>;
}

export class DeviceRemoteDataSource implements IDeviceRemoteDataSource {
    constructor(private readonly client: ISocketClient) {}

    public async saveDevice(payload: DeviceSaveInput): Promise<DeviceView> {
        return this.client.request('device.save', payload) as Promise<DeviceView>;
    }

    public async readDevice(payload: DeviceReadInput): Promise<DeviceView> {
        return this.client.request('device.read', payload) as Promise<DeviceView>;
    }

    public async syncDevice(payload: DeviceSyncInput): Promise<unknown> {
        return this.client.request('device.sync', payload);
    }
}
