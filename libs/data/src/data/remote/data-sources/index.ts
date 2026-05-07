import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/domain';
import type { SocketEventMap } from '../../events/socket';
import type { IWebSocketClient } from '../clients';
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
 * 네트워크 client 또는 event bus 연결 방식이 바뀌면 이 factory의 인자만 조정하면 됩니다.
 */
export const createRemoteDataSources = ({
    domainEventBus,
    socketEventBus,
    wssClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketEventBus: IEventBus<SocketEventMap>;
    wssClient: IWebSocketClient;
}): RemoteDataSources => ({
    auth: new AuthRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    channel: new ChannelRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    chat: new ChatRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    join: new JoinRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    site: new SiteRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    user: new UserRemoteDataSource(socketEventBus, domainEventBus, wssClient),
});
