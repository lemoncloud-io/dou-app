import { createContext, useContext, useMemo } from 'react';

import type { DataRepositories, RemoteDataSources } from '@chatic/data';
import {
    createRemoteDataSources,
    type DomainEventMap,
    EventBusEngine,
    type LocalDataSources,
    SocketDispatcher,
    type SocketEventMap,
    SocketRequestManager,
} from '@chatic/data';

import { useRepositoryContextHolder, useRepositoryFactory } from './repositoryFactory';
import type { DataProviderProps, DataProviderValue } from './types';
import { useSocketFactory } from './socketFactory';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({ children, context: injectedContext }: DataProviderProps) => {
    // socketEventBus: dispatcher가 raw socket envelope를 도메인별 RemoteDataSource로 전달하는 버스.
    // domainEventBus: RemoteDataSource가 정제한 domain event를 request manager와 Repository 내부 정책으로 전달하는 버스.
    const socketEventBus = useMemo(() => new EventBusEngine<SocketEventMap>(), []);
    const domainEventBus = useMemo(() => new EventBusEngine<DomainEventMap>(), []);

    const requestManager = useMemo(() => new SocketRequestManager(domainEventBus), [domainEventBus]);
    const dispatcher = useMemo(() => new SocketDispatcher(socketEventBus), [socketEventBus]);
    const context = useRepositoryContextHolder(injectedContext);
    const { wssClient } = useSocketFactory(dispatcher);

    const remoteDataSources: RemoteDataSources = useMemo(
        () => createRemoteDataSources({ domainEventBus, socketEventBus, wssClient }),
        [domainEventBus, socketEventBus, wssClient]
    );

    //TODO: Not Implement
    const localDataSources = {} as LocalDataSources;

    const { repositories } = useRepositoryFactory({
        remoteDataSources,
        localDataSources,
        context,
        domainEventBus,
    });

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
