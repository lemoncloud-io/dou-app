import type { RemoteGatewayBundle } from '../gateways';
import type { IAuthRemoteDataSource } from './AuthRemoteDataSource';
import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import type { IChannelRemoteDataSource } from './ChannelRemoteDataSource';
import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import type { IChatRemoteDataSource } from './ChatRemoteDataSource';
import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import type { IJoinRemoteDataSource } from './JoinRemoteDataSource';
import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import type { IPlaceRemoteDataSource } from './PlaceRemoteDataSource';
import { PlaceRemoteDataSource } from './PlaceRemoteDataSource';
import type { IUserRemoteDataSource } from './UserRemoteDataSource';
import { UserRemoteDataSource } from './UserRemoteDataSource';
import type { IDeviceRemoteDataSource } from './DeviceRemoteDataSource';
import { DeviceRemoteDataSource } from './DeviceRemoteDataSource';
import type { ISocketsRemoteDataSource } from './SocketsRemoteDataSource';
import { SocketsRemoteDataSource } from './SocketsRemoteDataSource';
import type { ICloudRemoteDataSource } from './CloudRemoteDataSource';
import { CloudRemoteDataSource } from './CloudRemoteDataSource';
import type { IProfileRemoteDataSource } from './ProfileRemoteDataSource';
import { ProfileRemoteDataSource } from './ProfileRemoteDataSource';

export * from './AuthRemoteDataSource';
export * from './ChannelRemoteDataSource';
export * from './ChatRemoteDataSource';
export * from './JoinRemoteDataSource';
export * from './PlaceRemoteDataSource';
export * from './UserRemoteDataSource';
export * from './DeviceRemoteDataSource';
export * from './SocketsRemoteDataSource';
export * from './CloudRemoteDataSource';
export * from './ProfileRemoteDataSource';

export interface RemoteDataSources {
    auth: IAuthRemoteDataSource;
    channel: IChannelRemoteDataSource;
    chat: IChatRemoteDataSource;
    join: IJoinRemoteDataSource;
    place: IPlaceRemoteDataSource;
    user: IUserRemoteDataSource;
    device: IDeviceRemoteDataSource;
    sockets: ISocketsRemoteDataSource;
    cloud: ICloudRemoteDataSource;
    profile: IProfileRemoteDataSource;
}

/**
 * RemoteDataSource 생성 위치를 한 곳으로 모웁니다.
 */
export const createRemoteDataSources = ({ gateways }: { gateways: RemoteGatewayBundle }): RemoteDataSources => ({
    auth: new AuthRemoteDataSource(gateways.auth),
    channel: new ChannelRemoteDataSource(gateways.channel),
    chat: new ChatRemoteDataSource(gateways.chat),
    join: new JoinRemoteDataSource(gateways.join),
    place: new PlaceRemoteDataSource(gateways.place),
    user: new UserRemoteDataSource(gateways.user),
    device: new DeviceRemoteDataSource(gateways.device),
    sockets: new SocketsRemoteDataSource(gateways.sockets),
    cloud: new CloudRemoteDataSource(gateways.cloud),
    profile: new ProfileRemoteDataSource(gateways.profile),
});
