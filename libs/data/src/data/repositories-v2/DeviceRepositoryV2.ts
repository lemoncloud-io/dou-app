import type { DeviceStatus, ViewingType } from '@lemoncloud/chatic-sockets-lib';
import type { IDeviceRemoteDataSource } from '../remote/data-sources';
import type { SocketRoute } from '../remote/gateways';
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
     * intentionally omitted so the server targets the device linked to the current connection. The
     * DESTINATION is the caller's choice via `opts.route` (default `active`); push settings are
     * relay-owned, so the mypage caller passes `route: 'relay'` to keep the write on the relay socket
     * even while a cloud slot is active.
     */
    updateRemotePushMute(muted: boolean, opts?: { route?: SocketRoute }): Promise<boolean>;
}

/**
 * Viewing notification is a tick-neutral, fire-and-forget signal, so this repository keeps no
 * local cache — it only forwards the current viewing target to the live socket. (Reading other
 * devices' state would need a cache; that is intentionally out of scope here.)
 */
export class DeviceRepositoryV2 extends BaseRepositoryV2 implements IDeviceRepositoryV2 {
    constructor(
        private readonly deviceRemoteDataSource: IDeviceRemoteDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public syncDevice(viewingType: ViewingType, viewingId: string): void {
        // `tick` is server-owned and must never be sent from the client; forward only the pair.
        this.deviceRemoteDataSource.syncDevice({ viewingType, viewingId });
    }

    public syncStatus(status: DeviceStatus): void {
        // Server-side partial merge: sending status alone keeps the viewing pair intact.
        this.deviceRemoteDataSource.syncDevice({ status });
    }

    public async updateRemotePushMute(muted: boolean, opts?: { route?: SocketRoute }): Promise<boolean> {
        // Omit `id`: the server resolves the device from the current connection. Return the server's
        // authoritative `muted` echo so the caller can sync its optimistic state to the real value;
        // fall back to the requested value if the response omits it.
        const view = await this.deviceRemoteDataSource.updateRemoteDevice({ muted }, opts?.route);
        return typeof view.muted === 'boolean' ? view.muted : muted;
    }
}
