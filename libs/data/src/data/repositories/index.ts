import type { RemoteDataSources } from '../remote/data-sources';
import type { LocalDataSources } from '../local/data-sources';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { IAuthRepository } from './AuthRepository';
import { AuthRepository } from './AuthRepository';
import type { IChannelRepository } from './ChannelRepository';
import { ChannelRepository } from './ChannelRepository';
import type { IChatRepository } from './ChatRepository';
import { ChatRepository } from './ChatRepository';
import type { IJoinRepository } from './JoinRepository';
import { JoinRepository } from './JoinRepository';
import type { IUserRepository } from './UserRepository';
import { UserRepository } from './UserRepository';
import type { ISiteRepository } from './SiteRepository';
import { SiteRepository } from './SiteRepository';
import type { IInviteCloudRepository } from './InviteCloudRepository';
import { InviteCloudRepository } from './InviteCloudRepository';
import type { IDeviceRepository } from './DeviceRepository';
import { DeviceRepository } from './DeviceRepository';
import type { ISocketsRepository } from './SocketsRepository';
import { SocketsRepository } from './SocketsRepository';
import type { ICloudRepository } from './CloudRepository';
import { CloudRepository } from './CloudRepository';
import type { IProfileRepository } from './ProfileRepository';
import { ProfileRepository } from './ProfileRepository';
import type { DataContextProvider } from './types';

export * from './AuthRepository';
export * from './ChannelRepository';
export * from './ChatRepository';
export * from './InviteCloudRepository';
export * from './JoinRepository';
export * from './SiteRepository';
export * from './UserRepository';
export * from './DeviceRepository';
export * from './SocketsRepository';
export * from './CloudRepository';
export * from './ProfileRepository';
export * from './types';

/**
 * Web 화면 계층에 노출되는 Repository 묶음입니다.
 * UI/Hook 계층은 RemoteDataSource나 SocketRequestManager 대신 이 객체만 사용합니다.
 */
export interface DataRepositories {
    auth: IAuthRepository;
    channel: IChannelRepository;
    chat: IChatRepository;
    join: IJoinRepository;
    user: IUserRepository;
    site: ISiteRepository;
    inviteCloud: IInviteCloudRepository;
    device: IDeviceRepository;
    sockets: ISocketsRepository;
    cloud: ICloudRepository;
    profile: IProfileRepository;
}

/**
 * Repository 생성 위치를 한 곳으로 모읍니다.
 * domainEventBus listener는 Repository 내부 side effect 전용이므로 UI/Hook 계층에 직접 노출하지 않습니다.
 */
export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    context,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    context: DataContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
}): DataRepositories => ({
    auth: new AuthRepository(remoteDataSources.auth, context, domainEventBus),
    channel: new ChannelRepository(remoteDataSources.channel, localDataSources.channel, context, domainEventBus),
    chat: new ChatRepository(remoteDataSources.chat, localDataSources.chat, context, domainEventBus),
    join: new JoinRepository(remoteDataSources.join, localDataSources.join, context, domainEventBus),
    site: new SiteRepository(remoteDataSources.site, localDataSources.site, context, domainEventBus),
    user: new UserRepository(remoteDataSources.user, localDataSources.user, context, domainEventBus),
    inviteCloud: new InviteCloudRepository(localDataSources.inviteCloud, context, domainEventBus),
    device: new DeviceRepository(remoteDataSources.device, context, domainEventBus),
    sockets: new SocketsRepository(remoteDataSources.sockets, context, domainEventBus),
    cloud: new CloudRepository(remoteDataSources.cloud, context, domainEventBus),
    profile: new ProfileRepository(remoteDataSources.profile, context, domainEventBus),
});
