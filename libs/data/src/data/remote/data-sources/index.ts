import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { ISocketClient } from '../sockets/clients/clients';
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
    socketClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketClient: ISocketClient;
}): RemoteDataSources => ({
    auth: new AuthRemoteDataSource(domainEventBus, socketClient),
    channel: new ChannelRemoteDataSource(domainEventBus, socketClient),
    chat: new ChatRemoteDataSource(domainEventBus, socketClient),
    join: new JoinRemoteDataSource(domainEventBus, socketClient),
    site: new SiteRemoteDataSource(domainEventBus, socketClient),
    user: new UserRemoteDataSource(domainEventBus, socketClient),
    device: new DeviceRemoteDataSource(domainEventBus, socketClient),
    sockets: new SocketsRemoteDataSource(domainEventBus, socketClient),
    cloud: new CloudRemoteDataSource(socketClient),
    profile: new ProfileRemoteDataSource(socketClient),
});
