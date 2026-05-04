import { createContext, useContext, useMemo } from 'react';

import {
    EventBusEngine,
    SocketDispatcher,
    SocketRequestManager,
    type DomainEventMap,
    type SocketEventMap,
} from '@chatic/data';

import { useRepositoryContextHolder } from './repositoryFactory';
import { useDataSocket } from './socketFactory';
import { createDataSources, createRepositories } from './repositoryFactory';
import type { DataProviderProps, DataProviderValue, DataRepositories } from './types';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({ children, context: injectedContext, inviteCloudRepository }: DataProviderProps) => {
    // socketEventBus: dispatcher가 raw socket envelope를 도메인별 RemoteDataSource로 전달하는 버스.
    // domainEventBus: RemoteDataSource가 정제한 domain event를 request manager와 Repository 내부 정책으로 전달하는 버스.
    const socketEventBus = useMemo(() => new EventBusEngine<SocketEventMap>(), []);
    const domainEventBus = useMemo(() => new EventBusEngine<DomainEventMap>(), []);

    const requestManager = useMemo(() => new SocketRequestManager(domainEventBus), [domainEventBus]);
    const dispatcher = useMemo(() => new SocketDispatcher(socketEventBus), [socketEventBus]);
    const context = useRepositoryContextHolder(injectedContext);
    const wssClient = useDataSocket({ context, dispatcher });

    const dataSources = useMemo(
        () => createDataSources({ domainEventBus, socketEventBus, wssClient }),
        [domainEventBus, socketEventBus, wssClient]
    );

    const repositories = useMemo<DataRepositories>(
        () => createRepositories({ context, dataSources, domainEventBus, inviteCloudRepository, requestManager }),
        [context, dataSources, domainEventBus, inviteCloudRepository, requestManager]
    );

    const value = useMemo<DataProviderValue>(
        () => ({
            repositories,
            requestManager,
            dispatcher,
            context,
            setRepositoryContext: nextContext => context.setContext(nextContext),
        }),
        [context, dispatcher, repositories, requestManager]
    );

    return <DataProviderContext.Provider value={value}>{children}</DataProviderContext.Provider>;
};

export const useDataProvider = (): DataProviderValue => {
    const value = useContext(DataProviderContext);
    if (!value) {
        throw new Error('useDataProvider must be used within WebDataProvider');
    }
    return value;
};

export const useRepositories = (): DataRepositories => useDataProvider().repositories;
