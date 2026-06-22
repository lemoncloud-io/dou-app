import type {
    DataContextProvider,
    DataRepositories,
    IEventBus,
    LocalDataSources,
    RemoteDataSources,
} from '@chatic/data';
import { createRepositories as createDataRepositories, type DomainEventMap } from '@chatic/data';

export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
    domainEventBus,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSources;
    contextProvider: DataContextProvider;
    domainEventBus: IEventBus<DomainEventMap>;
}): DataRepositories =>
    createDataRepositories({
        remoteDataSources,
        localDataSources,
        context: contextProvider,
        domainEventBus,
    });
