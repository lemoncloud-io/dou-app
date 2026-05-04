import { useEffect, useMemo, useState } from 'react';

import type { EventBusEngine } from '@chatic/data';
import {
    AuthRemoteDataSource,
    AuthRepository,
    ChannelRemoteDataSource,
    ChannelRepository,
    ChatRemoteDataSource,
    ChatRepository,
    type DomainEventMap,
    type IInviteCloudRepository,
    type IWebSocketClient,
    JoinRemoteDataSource,
    JoinRepository,
    MutableRepositoryContext,
    type RepositoryContext,
    SiteRemoteDataSource,
    SiteRepository,
    type SocketEventMap,
    SocketRequestManager,
    UserRemoteDataSource,
    UserRepository,
} from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import type { DataRepositories } from './types';

/**
 * Repository 인스턴스를 재생성하지 않고 context 값만 갱신하기 위한 mutable holder를 만듭니다.
 *
 * 우선순위:
 * 1. Provider prop으로 명시 주입된 context
 * 2. web-core/socket store에서 읽은 현재 세션 값
 * 3. cloud 미선택 시 default cloud
 *
 * Repository는 holder를 참조하므로 cid/sid/uid 변경이 getContext 호출 시점에 반영됩니다.
 */
export const useRepositoryContextHolder = (injectedContext?: RepositoryContext): MutableRepositoryContext => {
    const cloudId = useWebSocketV2Store((state: { cloudId?: string | null }) => state.cloudId);
    const profileUid = useWebCoreStore(state => state.profile?.uid);
    // place 선택 값은 cloudCore storage에 존재한다.
    // 같은 탭 storage 변경은 이벤트가 발생하지 않으므로 provider 렌더링 시점마다 최신 값을 다시 읽는다.
    const selectedPlaceId = cloudCore.getSelectedPlaceId() || undefined;

    const repositoryContext = useMemo<RepositoryContext>(() => {
        return {
            ...injectedContext,
            cid: injectedContext?.cid ?? cloudId ?? 'default',
            sid: injectedContext?.sid ?? selectedPlaceId,
            uid: injectedContext?.uid ?? profileUid ?? undefined,
        };
    }, [injectedContext, cloudId, profileUid, selectedPlaceId]);

    const [context] = useState(() => new MutableRepositoryContext(repositoryContext));

    useEffect(() => {
        context.setContext(repositoryContext);
    }, [context, repositoryContext]);

    return context;
};

/**
 * RemoteDataSource 생성 위치를 한 곳으로 모읍니다.
 * 네트워크 client 또는 event bus 연결 방식이 바뀌면 이 factory의 인자만 조정하면 됩니다.
 */
const createDataSources = ({
    domainEventBus,
    socketEventBus,
    wssClient,
}: {
    domainEventBus: EventBusEngine<DomainEventMap>;
    socketEventBus: EventBusEngine<SocketEventMap>;
    wssClient: IWebSocketClient;
}) => ({
    auth: new AuthRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    channel: new ChannelRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    chat: new ChatRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    join: new JoinRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    site: new SiteRemoteDataSource(socketEventBus, domainEventBus, wssClient),
    user: new UserRemoteDataSource(socketEventBus, domainEventBus, wssClient),
});

type DataSources = ReturnType<typeof createDataSources>;

/**
 * Repository 생성 위치를 한 곳으로 모읍니다.
 * domainEventBus listener는 Repository 내부 side effect 전용이므로 UI/Hook 계층에 직접 노출하지 않습니다.
 */
const createRepositories = ({
    context,
    dataSources,
    domainEventBus,
    inviteCloudRepository,
    requestManager,
}: {
    context: MutableRepositoryContext;
    dataSources: DataSources;
    domainEventBus: EventBusEngine<DomainEventMap>;
    inviteCloudRepository?: IInviteCloudRepository;
    requestManager: SocketRequestManager;
}): DataRepositories => ({
    auth: new AuthRepository(dataSources.auth, requestManager, context, domainEventBus),
    channel: new ChannelRepository(dataSources.channel, requestManager, context, domainEventBus),
    chat: new ChatRepository(dataSources.chat, requestManager, context, domainEventBus),
    join: new JoinRepository(dataSources.join, requestManager, context, domainEventBus),
    site: new SiteRepository(dataSources.site, requestManager, context, domainEventBus),
    user: new UserRepository(dataSources.user, requestManager, context, domainEventBus),
    inviteCloud: inviteCloudRepository,
});

/**
 * Repository 계층에 필요한 생성과 context 주입을 한 곳에서 처리합니다.
 * DataProvider는 event bus와 socket client만 넘기고, requestManager/dataSource/repository 조립은 이 factory에 위임합니다.
 */
export const useRepositoryFactory = ({
    context,
    domainEventBus,
    inviteCloudRepository,
    socketEventBus,
    wssClient,
}: {
    context: MutableRepositoryContext;
    domainEventBus: EventBusEngine<DomainEventMap>;
    inviteCloudRepository?: IInviteCloudRepository;
    socketEventBus: EventBusEngine<SocketEventMap>;
    wssClient: IWebSocketClient;
}): { repositories: DataRepositories } => {
    const requestManager = useMemo(() => new SocketRequestManager(domainEventBus), [domainEventBus]);
    const dataSources = useMemo(
        () => createDataSources({ domainEventBus, socketEventBus, wssClient }),
        [domainEventBus, socketEventBus, wssClient]
    );
    const repositories = useMemo(
        () => createRepositories({ context, dataSources, domainEventBus, inviteCloudRepository, requestManager }),
        [context, dataSources, domainEventBus, inviteCloudRepository, requestManager]
    );

    return { repositories };
};
