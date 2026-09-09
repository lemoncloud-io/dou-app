import type { DeviceStatus, ViewingType } from '@lemoncloud/chatic-sockets-lib';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { IDeviceSocketDataSource } from '../remote/socket-data-sources';
import type { IDeviceRegistrationHttpSource } from '../remote/http-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface IDeviceRepositoryV2 extends DisposableRepositoryV2 {
    /**
     * device.sync — notify which target the current device is viewing.
     * Fire-and-forget and tick-neutral (the server owns `tick`). Always send the pair:
     * `syncDevice('channel', id)` on enter, `syncDevice('', '')` to clear.
     */
    syncDevice(viewingType: ViewingType, viewingId: string): void;

    /**
     * device.sync — report the device's presence status (green = foreground,
     * yellow = background). The server merges partial payloads, so status travels
     * alone and never disturbs the viewing pair. Fire-and-forget and tick-neutral.
     */
    syncStatus(status: DeviceStatus): void;

    /**
     * device.update-remote — set the connection-linked device's GLOBAL push mute (remote push
     * settings owned by chatic-pushes-api) and return the server's authoritative `muted`. `id` is
     * intentionally omitted so the server targets the device linked to the current connection.
     * Always writes over the RELAY socket — the destination is pinned in the data source, not
     * chosen by callers (see DeviceSocketDataSource.updateRemoteDevice).
     */
    updateRemotePushMute(muted: boolean): Promise<boolean>;

    /**
     * `POST /users/0/reg-dev` — HTTP push-token registration (ADR-0070 결정 5, 2단계 후반). Distinct
     * from `updateRemotePushMute` (소켓 `device.update-remote`, GLOBAL mute setting) — this
     * registers the token itself. `IDeviceRegistrationHttpSource` injection is optional through
     * 2단계.
     */
    registerPushDevice(body: Record<string, unknown>, opts?: { force?: boolean }): Promise<RegisterDeviceResult>;
}

/**
 * Viewing notification is a tick-neutral, fire-and-forget signal, so this repository keeps no
 * local cache — it only forwards the current viewing target to the live socket. (Reading other
 * devices' state would need a cache; that is intentionally out of scope here.)
 */
export class DeviceRepositoryV2 extends BaseRepositoryV2 implements IDeviceRepositoryV2 {
    constructor(
        private readonly deviceSocketDataSource: IDeviceSocketDataSource,
        contextProvider: DataContextProvider,
        private readonly deviceRegistrationHttpSource?: IDeviceRegistrationHttpSource
    ) {
        super(contextProvider);
    }

    public async registerPushDevice(
        body: Record<string, unknown>,
        opts?: { force?: boolean }
    ): Promise<RegisterDeviceResult> {
        if (!this.deviceRegistrationHttpSource) {
            throw new Error(
                '[DeviceRepositoryV2] IDeviceRegistrationHttpSource is not injected — httpFactory not wired yet.'
            );
        }
        return this.deviceRegistrationHttpSource.registerPushDevice(body, opts);
    }

    public syncDevice(viewingType: ViewingType, viewingId: string): void {
        // `tick` is server-owned and must never be sent from the client; forward only the pair.
        this.deviceSocketDataSource.syncDevice({ viewingType, viewingId });
    }

    public syncStatus(status: DeviceStatus): void {
        // Server-side partial merge: sending status alone keeps the viewing pair intact.
        this.deviceSocketDataSource.syncDevice({ status });
    }

    public async updateRemotePushMute(muted: boolean): Promise<boolean> {
        // Omit `id`: the server resolves the device from the current connection. Return the server's
        // authoritative `muted` echo so the caller can sync its optimistic state to the real value;
        // fall back to the requested value if the response omits it.
        const view = await this.deviceSocketDataSource.updateRemoteDevice({ muted });
        return typeof view.muted === 'boolean' ? view.muted : muted;
    }
}
