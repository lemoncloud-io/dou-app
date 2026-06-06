import { useMemo } from 'react';

import type {
    DataContextProvider,
    DataRepositories,
    IEventBus,
    ISocketRequestManager,
    LocalDataSources,
    RemoteDataSources,
} from '@chatic/data';
import { createRepositories, type DomainEventMap } from '@chatic/data';

export const useRepositoryFactory = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
    domainEventBus,
    requestManager,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    contextProvider: DataContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
    requestManager: ISocketRequestManager;
}): { repositories: DataRepositories } => {
    const repositories = useMemo(
        () =>
            createRepositories({
                remoteDataSources,
                localDataSources,
                context: contextProvider,
                domainEventBus,
                requestManager,
            }),
        [contextProvider, remoteDataSources, localDataSources, domainEventBus, requestManager]
    );

    return { repositories };
};
