import { useEffect, useMemo } from 'react';
import type { IEventBus, ISocketClient } from '@chatic/data';
import { createRemoteDataSources, type DomainEventMap, SocketDispatcher } from '@chatic/data';

export const useRemoteDataSourcesFactory = ({
    domainEventBus,
    socketClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketClient: ISocketClient;
}) => {
    // 1. RemoteDataSource 조립
    const remoteDataSources = useMemo(
        () => createRemoteDataSources({ domainEventBus, socketClient }),
        [domainEventBus, socketClient]
    );

    // 2. SocketDispatcher 생성 (인바운드 모델 변경 감지 및 데이터소스 분배)
    const dispatcher = useMemo(
        () =>
            new SocketDispatcher(
                socketClient,
                remoteDataSources.channel,
                remoteDataSources.chat,
                remoteDataSources.join,
                remoteDataSources.user,
                remoteDataSources.auth,
                remoteDataSources.device,
                remoteDataSources.sockets
            ),
        [socketClient, remoteDataSources]
    );

    // Dispatcher 정리
    useEffect(() => {
        return () => {
            dispatcher.destroy();
        };
    }, [dispatcher]);

    return { remoteDataSources };
};
