import { createContext, useContext, useMemo } from 'react';

import type { DataContext, DataRepositories, IEventBus, ISocketClient } from '@chatic/data';
import { type DomainEventMap, EventBusEngine } from '@chatic/data';

import { useRepositoryFactory } from './repositoryFactory';
import type { DataProviderProps, DataProviderValue } from './types';
import { useDataContextHolder } from './contextHolder';
import { useRemoteDataSourcesFactory } from './remoteFactory';
import { useLocalDataSourcesFactory } from './localFactory';
import { getSocketClientAdapter } from '../socket';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({
    children,
    context: injectedContext,
    socketClient: injectedSocketClient,
}: DataProviderProps) => {
    const socketClient = useMemo<ISocketClient>(
        () => injectedSocketClient ?? getSocketClientAdapter(),
        [injectedSocketClient]
    );

    const domainEventBus: IEventBus<DomainEventMap> = useMemo(() => new EventBusEngine<DomainEventMap>(), []);

    const { contextHolder } = useDataContextHolder(injectedContext);
    const { remoteDataSources } = useRemoteDataSourcesFactory({ domainEventBus, socketClient });

    const { localDataSources } = useLocalDataSourcesFactory({
        contextProvider: contextHolder,
    });

    const { repositories } = useRepositoryFactory({
        remoteDataSources,
        localDataSources,
        contextProvider: contextHolder,
        domainEventBus,
    });

    const value = useMemo<DataProviderValue>(
        () => ({
            repositories,
            setDataContext: (nextContext: DataContext) => contextHolder.setContext(nextContext),
        }),
        [contextHolder, repositories]
    );

    return <DataProviderContext.Provider value={value}>{children}</DataProviderContext.Provider>;
};

export const useDataProvider = (): DataProviderValue => {
    const value = useContext(DataProviderContext);
    if (!value) {
        throw new Error('useDataProvider must be used within DataProvider');
    }
    return value;
};

export const useRepositories = (): DataRepositories => useDataProvider().repositories;
