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

export * from './AuthRemoteDataSource';
export * from './ChannelRemoteDataSource';
export * from './ChatRemoteDataSource';
export * from './JoinRemoteDataSource';
export * from './SiteRemoteDataSource';
export * from './UserRemoteDataSource';

export interface RemoteDataSources {
    auth: IAuthRemoteDataSource;
    channel: IChannelRemoteDataSource;
    chat: IChatRemoteDataSource;
    join: IJoinRemoteDataSource;
    site: ISiteRemoteDataSource;
    user: IUserRemoteDataSource;
}

/**
 * RemoteDataSource 생성 위치를 한 곳으로 모읍니다.
 */
export const createRemoteDataSources = ({
    domainEventBus,
    socketClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketClient: ISocketClient;
}): RemoteDataSources => ({
    auth: new AuthRemoteDataSource(socketClient),
    channel: new ChannelRemoteDataSource(domainEventBus, socketClient),
    chat: new ChatRemoteDataSource(domainEventBus, socketClient),
    join: new JoinRemoteDataSource(domainEventBus, socketClient),
    site: new SiteRemoteDataSource(domainEventBus, socketClient),
    user: new UserRemoteDataSource(domainEventBus, socketClient),
});
