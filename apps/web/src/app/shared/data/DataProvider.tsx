import { createContext, useContext, useMemo } from 'react';

import type { IEventBus, ISocketDispatcher } from '@chatic/data';
import { EventBusEngine, type DomainEventMap, type SocketEventMap, SocketDispatcher } from '@chatic/data';

import { useRepositoryContextHolder, useRepositoryFactory } from './repositoryFactory';
import { useSocketFactory } from './socketFactory';
import type { DataProviderProps, DataProviderValue, DataRepositories } from './types';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({ children, context: injectedContext }: DataProviderProps) => {
    // socketEventBus: WebSocket 수신 메시지 -> RemoteDataSource
    // domainEventBus: RemoteDataSource 정제 이벤트 -> Repository & RequestManager
    const socketEventBus: IEventBus<SocketEventMap> = useMemo(() => new EventBusEngine<SocketEventMap>(), []);
    const domainEventBus: IEventBus<DomainEventMap> = useMemo(() => new EventBusEngine<DomainEventMap>(), []);

    const socketDispatcher: ISocketDispatcher = useMemo(() => new SocketDispatcher(socketEventBus), [socketEventBus]);
    const { wssClient } = useSocketFactory(socketDispatcher);

    // 컨텍스트 홀더 초기화 (사용자/클라우드 세션 정보)
    const repositoryContext = useRepositoryContextHolder(injectedContext);

    // 레포지토리 팩토리 초기화
    const { repositories } = useRepositoryFactory({
        context: repositoryContext,
        domainEventBus,
        socketEventBus,
        wssClient,
    });

    const value = useMemo<DataProviderValue>(
        () => ({
            repositories,
            setRepositoryContext: nextContext => repositoryContext.setContext(nextContext),
        }),
        [repositoryContext, repositories]
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
