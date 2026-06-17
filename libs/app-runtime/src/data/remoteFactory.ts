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
    const remoteDataSources = useMemo(
        () =>
            (
                createRemoteDataSources as unknown as (args: {
                    domainEventBus: IEventBus<DomainEventMap>;
                    socketClient: ISocketClient;
                }) => ReturnType<typeof createRemoteDataSources>
            )({ domainEventBus, socketClient }),
        [domainEventBus, socketClient]
    );

    const dispatcher = useMemo(
        () =>
            new (SocketDispatcher as unknown as new (
                socketClient: ISocketClient,
                channel: typeof remoteDataSources.channel,
                chat: typeof remoteDataSources.chat,
                join: typeof remoteDataSources.join,
                user: typeof remoteDataSources.user,
                auth: typeof remoteDataSources.auth,
                device: typeof remoteDataSources.device,
                sockets: typeof remoteDataSources.sockets
            ) => { destroy(): void })(
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
