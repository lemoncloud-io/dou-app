// Device types come from chatic-sockets-lib — the package whose DeviceGateway this wraps.
// The chatic-sockets-api copy of DeviceSyncRequestData lags behind (no viewingType/viewingId),
// so importing from it would drop the viewing fields the live gateway accepts.
import type {
    DeviceReadInput,
    DeviceSaveInput,
    DeviceSyncInput,
    DeviceUpdateRemoteInput,
    DeviceView,
} from '@lemoncloud/chatic-sockets-lib';
import type { DeviceDomainGateway, RoutedGateway, SocketRoute } from '../gateways';

export interface IDeviceRemoteDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): void;
    /**
     * device.update-remote — update the connection-linked device's remote push settings (muted).
     * `route` selects the destination slot (default `active`); push-mute must be sent to `relay`.
     * Response is the pushes-api PushDeviceView, passed through untyped (SDK owns the shape).
     */
    updateRemoteDevice<T = unknown>(payload: DeviceUpdateRemoteInput, route?: SocketRoute): Promise<T>;
}

export class DeviceRemoteDataSource implements IDeviceRemoteDataSource {
    constructor(private readonly gateway: RoutedGateway<DeviceDomainGateway>) {}

    public async saveDevice(payload: DeviceSaveInput): Promise<DeviceView> {
        // save/read/sync are viewing/presence concerns → always the active slot.
        return this.gateway.active.save(payload);
    }

    public async readDevice(payload: DeviceReadInput): Promise<DeviceView> {
        return this.gateway.active.read(payload);
    }

    public syncDevice(payload: DeviceSyncInput) {
        this.gateway.active.sync(payload);
    }

    public async updateRemoteDevice<T = unknown>(
        payload: DeviceUpdateRemoteInput,
        route: SocketRoute = 'active'
    ): Promise<T> {
        return this.gateway[route].updateRemote<T>(payload);
    }
}
