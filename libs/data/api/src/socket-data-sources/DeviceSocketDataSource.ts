import type {
    DeviceReadInput,
    DeviceSaveInput,
    DeviceSyncInput,
    DeviceUpdateRemoteInput,
    DeviceView,
} from '@lemoncloud/chatic-sockets-lib';
import type { DeviceSocketDomainGateway, RoutedGateway } from '../gateways';

export interface DevicePushView {
    id?: string;
    muted?: boolean;
}

export interface IDeviceSocketDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): void;
    updateRemoteDevice(payload: DeviceUpdateRemoteInput): Promise<DevicePushView>;
}

export class DeviceSocketDataSource implements IDeviceSocketDataSource {
    constructor(private readonly gateway: RoutedGateway<DeviceSocketDomainGateway>) {}

    public async saveDevice(payload: DeviceSaveInput): Promise<DeviceView> {
        return this.gateway.active.save(payload);
    }

    public async readDevice(payload: DeviceReadInput): Promise<DeviceView> {
        return this.gateway.active.read(payload);
    }

    public syncDevice(payload: DeviceSyncInput) {
        this.gateway.active.sync(payload);
    }

    public async updateRemoteDevice(payload: DeviceUpdateRemoteInput): Promise<DevicePushView> {
        return this.gateway.relay.updateRemote<DevicePushView>(payload);
    }
}
