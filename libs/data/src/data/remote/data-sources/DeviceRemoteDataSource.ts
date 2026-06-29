import type { DeviceReadInput, DeviceSaveInput, DeviceSyncInput, DeviceView } from '@lemoncloud/chatic-sockets-api';
import type { DeviceDomainGateway } from '../gateways';

export interface IDeviceRemoteDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): void;
}

export class DeviceRemoteDataSource implements IDeviceRemoteDataSource {
    constructor(private readonly gateway: DeviceDomainGateway) {}

    public async saveDevice(payload: DeviceSaveInput): Promise<DeviceView> {
        return this.gateway.save(payload);
    }

    public async readDevice(payload: DeviceReadInput): Promise<DeviceView> {
        return this.gateway.read(payload);
    }

    public async syncDevice(payload: DeviceSyncInput) {
        this.gateway.sync(payload);
    }
}
