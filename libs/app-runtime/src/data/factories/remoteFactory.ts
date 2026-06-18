import type { IEventBus, ISocketClient } from '@chatic/data';
import {
    createRemoteDataSources as createDataRemoteDataSources,
    type DomainEventMap,
    SocketDispatcher,
} from '@chatic/data';

export const createRemoteDataSources = ({
    domainEventBus,
    socketClient,
}: {
    domainEventBus: IEventBus<DomainEventMap>;
    socketClient: ISocketClient;
}) => {
    const remoteDataSources = (
        createDataRemoteDataSources as unknown as (args: {
            domainEventBus: IEventBus<DomainEventMap>;
            socketClient: ISocketClient;
        }) => ReturnType<typeof createDataRemoteDataSources>
    )({ domainEventBus, socketClient });

    const dispatcher = new (SocketDispatcher as unknown as new (
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
    );

    return { remoteDataSources, dispatcher };
};
