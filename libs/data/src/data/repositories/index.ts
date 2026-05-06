import type { RemoteDataSources } from '../remote/data-sources';
import type { LocalDataSources } from '../local/data-sources';
import type { RepositoryContextProvider } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
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

export * from './AuthRepository';
export * from './ChannelRepository';
export * from './ChatRepository';
export * from './InviteCloudRepository';
export * from './JoinRepository';
export * from './SiteRepository';
export * from './types';
export * from './UserRepository';

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
    inviteCloud?: IInviteCloudRepository;
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
    requestManager,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    context: RepositoryContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
    requestManager: ISocketRequestManager;
}): DataRepositories => ({
    auth: new AuthRepository(remoteDataSources.auth, requestManager, context, domainEventBus),
    channel: new ChannelRepository(
        remoteDataSources.channel,
        localDataSources.channel,
        requestManager,
        context,
        domainEventBus
    ),
    chat: new ChatRepository(remoteDataSources.chat, localDataSources.chat, requestManager, context, domainEventBus),
    join: new JoinRepository(remoteDataSources.join, localDataSources.join, requestManager, context, domainEventBus),
    site: new SiteRepository(remoteDataSources.site, localDataSources.site, requestManager, context, domainEventBus),
    user: new UserRepository(remoteDataSources.user, localDataSources.user, requestManager, context, domainEventBus),
    inviteCloud: new InviteCloudRepository(localDataSources.inviteCloud, requestManager, context, domainEventBus),
});
