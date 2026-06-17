import { useMemo } from 'react';

import type {
    DataContextProvider,
    DataRepositories,
    IEventBus,
    LocalDataSources,
    RemoteDataSources,
} from '@chatic/data';
import { createRepositories, type DomainEventMap } from '@chatic/data';

export const useRepositoryFactory = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    contextProvider: DataContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
}): { repositories: DataRepositories } => {
    const repositories = useMemo(
        () =>
            createRepositories({
                remoteDataSources,
                localDataSources,
                context: contextProvider,
                domainEventBus,
            }),
        [contextProvider, remoteDataSources, localDataSources, domainEventBus]
    );

    return { repositories };
};
