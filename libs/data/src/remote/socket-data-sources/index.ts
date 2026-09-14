import type { SocketGatewayBundle } from '../gateways';
import type { IAuthSocketDataSource } from './AuthSocketDataSource';
import { AuthSocketDataSource } from './AuthSocketDataSource';
import type { IChannelSocketDataSource } from './ChannelSocketDataSource';
import { ChannelSocketDataSource } from './ChannelSocketDataSource';
import type { IChatSocketDataSource } from './ChatSocketDataSource';
import { ChatSocketDataSource } from './ChatSocketDataSource';
import type { IInviteSocketDataSource } from './InviteSocketDataSource';
import { InviteSocketDataSource } from './InviteSocketDataSource';
import type { IJoinSocketDataSource } from './JoinSocketDataSource';
import { JoinSocketDataSource } from './JoinSocketDataSource';
import type { IPlaceSocketDataSource } from './PlaceSocketDataSource';
import { PlaceSocketDataSource } from './PlaceSocketDataSource';
import type { IUserSocketDataSource } from './UserSocketDataSource';
import { UserSocketDataSource } from './UserSocketDataSource';
import type { IDeviceSocketDataSource } from './DeviceSocketDataSource';
import { DeviceSocketDataSource } from './DeviceSocketDataSource';
import type { IConnectionSocketDataSource } from './ConnectionSocketDataSource';
import { ConnectionSocketDataSource } from './ConnectionSocketDataSource';
import type { ICloudSocketDataSource } from './CloudSocketDataSource';
import { CloudSocketDataSource } from './CloudSocketDataSource';
import type { IProfileSocketDataSource } from './ProfileSocketDataSource';
import { ProfileSocketDataSource } from './ProfileSocketDataSource';

export * from './AuthSocketDataSource';
export * from './ChannelSocketDataSource';
export * from './ChatSocketDataSource';
export * from './InviteSocketDataSource';
export * from './JoinSocketDataSource';
export * from './PlaceSocketDataSource';
export * from './UserSocketDataSource';
export * from './DeviceSocketDataSource';
export * from './ConnectionSocketDataSource';
export * from './CloudSocketDataSource';
export * from './ProfileSocketDataSource';

export interface SocketDataSources {
    auth: IAuthSocketDataSource;
    channel: IChannelSocketDataSource;
    chat: IChatSocketDataSource;
    invite: IInviteSocketDataSource;
    join: IJoinSocketDataSource;
    place: IPlaceSocketDataSource;
    user: IUserSocketDataSource;
    device: IDeviceSocketDataSource;
    connection: IConnectionSocketDataSource;
    cloud: ICloudSocketDataSource;
    profile: IProfileSocketDataSource;
}

/**
 * SocketDataSource 생성 위치를 한 곳으로 모웁니다.
 */
export const createSocketDataSources = ({ gateways }: { gateways: SocketGatewayBundle }): SocketDataSources => ({
    auth: new AuthSocketDataSource(gateways.auth),
    channel: new ChannelSocketDataSource(gateways.channel),
    chat: new ChatSocketDataSource(gateways.chat),
    invite: new InviteSocketDataSource(gateways.invite),
    join: new JoinSocketDataSource(gateways.join),
    place: new PlaceSocketDataSource(gateways.place),
    user: new UserSocketDataSource(gateways.user),
    device: new DeviceSocketDataSource(gateways.device),
    connection: new ConnectionSocketDataSource(gateways.connection),
    cloud: new CloudSocketDataSource(gateways.cloud),
    profile: new ProfileSocketDataSource(gateways.profile),
});
