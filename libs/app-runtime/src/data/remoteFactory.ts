import { useEffect, useMemo } from 'react';
import type { IEventBus } from '@chatic/data';
import { createRemoteDataSources, type DomainEventMap, SocketDispatcher } from '@chatic/data';
import type { RuntimeSocketClient } from '../socket/client-contract';

export const useRemoteDataSourcesFactory = ({
    domainEventBus,
    socketClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketClient: RuntimeSocketClient;
}) => {
    const remoteDataSources = useMemo(
        () => createRemoteDataSources({ domainEventBus, socketClient }),
        [domainEventBus, socketClient]
    );

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

    useEffect(() => {
        return () => {
            dispatcher.destroy();
        };
    }, [dispatcher]);

    return { remoteDataSources };
};
