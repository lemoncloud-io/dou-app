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
import type { DeviceSocketDomainGateway, RoutedGateway } from '../gateways';

/**
 * Client-safe view of the `device.update-remote` response. The server passes through the pushes-api
 * push-device view (endpoint / installId / status / platform / ...), but the app only needs the
 * authoritative `muted` echo — kept minimal so the external SDK shape never leaks into the app, and
 * so this doubles as a read (there is no standalone muted read endpoint). `muted` is optional because
 * a misconfigured/legacy backend could omit it; callers fall back to the requested value.
 */
export interface DevicePushView {
    id?: string;
    muted?: boolean;
}

export interface IDeviceSocketDataSource {
    saveDevice(payload: DeviceSaveInput): Promise<DeviceView>;
    readDevice(payload: DeviceReadInput): Promise<DeviceView>;
    syncDevice(payload: DeviceSyncInput): void;
    /**
     * device.update-remote — update the connection-linked device's remote push settings (muted) and
     * return the server's authoritative device push view. Always sent over the RELAY slot: push
     * settings live in chatic-pushes-api behind the relay server, regardless of which slot is active.
     */
    updateRemoteDevice(payload: DeviceUpdateRemoteInput): Promise<DevicePushView>;
}

export class DeviceSocketDataSource implements IDeviceSocketDataSource {
    constructor(private readonly gateway: RoutedGateway<DeviceSocketDomainGateway>) {}

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

    public async updateRemoteDevice(payload: DeviceUpdateRemoteInput): Promise<DevicePushView> {
        // Destination pinned HERE, not chosen by callers: update-remote is relay-owned by contract
        // (pushes-api sits behind the relay), so exposing a route would only invite a silent leak to
        // the active (cloud) slot. Re-expose a route parameter only when a second, genuinely
        // caller-dependent destination appears. See app-runtime socket/kind-scoped-routing.md.
        return this.gateway.relay.updateRemote<DevicePushView>(payload);
    }
}
