import { createContext, useContext, useMemo } from 'react';

import type { DataContext, DataRepositories, IEventBus } from '@chatic/data';
import { type DomainEventMap, EventBusEngine } from '@chatic/data';
import { createClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';
import { useUserContext } from '@chatic/web-core';

import { useRepositoryFactory } from './repositoryFactory';
import type { DataProviderProps, DataProviderValue } from './types';
import { useDataContextHolder } from './contextHolder';
import { useRemoteDataSourcesFactory } from './remoteFactory';
import { useLocalDataSourcesFactory } from './localFactory';
import { useDynamicDeviceId } from '../hooks/useDynamicDeviceId';

const DataProviderContext = createContext<DataProviderValue | null>(null);

export const DataProvider = ({ children, context: injectedContext }: DataProviderProps) => {
    const { deviceId } = useDynamicDeviceId();
    const { currentWSS, endpoints } = useUserContext();
    const endpoint = currentWSS === 'cloud' ? endpoints.cloudWSS : endpoints.relayWSS;

    // DataProvider 레벨에서 ClientSocketV2 인스턴스를 직접 생성 및 주입
    const socketClient = useMemo(() => {
        if (!endpoint || !deviceId) {
            // 연결 속성이 아직 로드되지 않은 경우 플레이스홀더 클라이언트 반환
            return createClientSocketV2({
                url: 'wss://dummy-url',
                device: null,
            });
        }
        return createClientSocketV2({
            url: endpoint + (endpoint.includes('?') ? '&' : '?') + 'v2=',
            device: { id: deviceId, platform: 'web' },
        });
    }, [endpoint, deviceId]);

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
            socketClient,
        }),
        [contextHolder, repositories, socketClient]
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
