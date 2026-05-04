import { createContext, useContext, useMemo } from 'react';

import { EventBusEngine, type DomainEventMap, type SocketEventMap } from '@chatic/data';

import { useRepositoryContextHolder, useRepositoryFactory } from './repositoryFactory';
import { useSocketFactory } from './socketFactory';
import type { DataProviderProps, DataProviderValue, DataRepositories } from './types';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({ children, context: injectedContext, inviteCloudRepository }: DataProviderProps) => {
    // socketEventBus: dispatcher가 raw socket envelope를 도메인별 RemoteDataSource로 전달하는 버스.
    // domainEventBus: RemoteDataSource가 정제한 domain event를 request manager와 Repository 내부 정책으로 전달하는 버스.
    const socketEventBus = useMemo(() => new EventBusEngine<SocketEventMap>(), []);
    const domainEventBus = useMemo(() => new EventBusEngine<DomainEventMap>(), []);

    const context = useRepositoryContextHolder(injectedContext);
    const { wssClient } = useSocketFactory({ context, socketEventBus });
    const { repositories } = useRepositoryFactory({
        context,
        domainEventBus,
        inviteCloudRepository,
        socketEventBus,
        wssClient,
    });

    const value = useMemo<DataProviderValue>(
        () => ({
            repositories,
            setRepositoryContext: nextContext => context.setContext(nextContext),
        }),
        [context, repositories]
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
