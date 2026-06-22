import type {
    DataContextProvider,
    IEventBus,
    RemoteDataSources,
    DataRepositoriesV2,
    LocalDataSourcesV2,
} from '@chatic/data';
import { createRepositoriesV2 as createDataRepositories, type DomainEventMap } from '@chatic/data';

export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    contextProvider: DataContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
}): DataRepositoriesV2 =>
    createDataRepositories({
        remoteDataSources,
        localDataSources,
        context: contextProvider,
        domainEventBus,
    });
