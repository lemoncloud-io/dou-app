import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { RemoteGatewayBundle } from '../gateways';
import type { IAuthRemoteDataSource } from './AuthRemoteDataSource';
import { AuthRemoteDataSource } from './AuthRemoteDataSource';
import type { IChannelRemoteDataSource } from './ChannelRemoteDataSource';
import { ChannelRemoteDataSource } from './ChannelRemoteDataSource';
import type { IChatRemoteDataSource } from './ChatRemoteDataSource';
import { ChatRemoteDataSource } from './ChatRemoteDataSource';
import type { IJoinRemoteDataSource } from './JoinRemoteDataSource';
import { JoinRemoteDataSource } from './JoinRemoteDataSource';
import type { ISiteRemoteDataSource } from './SiteRemoteDataSource';
import { SiteRemoteDataSource } from './SiteRemoteDataSource';
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
export * from './SiteRemoteDataSource';
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
    site: ISiteRemoteDataSource;
    user: IUserRemoteDataSource;
    device: IDeviceRemoteDataSource;
    sockets: ISocketsRemoteDataSource;
    cloud: ICloudRemoteDataSource;
    profile: IProfileRemoteDataSource;
}

/**
 * RemoteDataSource 생성 위치를 한 곳으로 모웁니다.
 */
export const createRemoteDataSources = ({
    domainEventBus,
    gateways,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    gateways: RemoteGatewayBundle;
}): RemoteDataSources => ({
    auth: new AuthRemoteDataSource(domainEventBus, gateways.auth),
    channel: new ChannelRemoteDataSource(domainEventBus, gateways.channel),
    chat: new ChatRemoteDataSource(domainEventBus, gateways.chat),
    join: new JoinRemoteDataSource(domainEventBus, gateways.join),
    site: new SiteRemoteDataSource(domainEventBus, gateways.site),
    user: new UserRemoteDataSource(domainEventBus, gateways.user),
    device: new DeviceRemoteDataSource(domainEventBus, gateways.device),
    sockets: new SocketsRemoteDataSource(domainEventBus, gateways.sockets),
    cloud: new CloudRemoteDataSource(gateways.cloud),
    profile: new ProfileRemoteDataSource(gateways.profile),
});
