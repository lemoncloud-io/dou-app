import type { DataContextProvider, DataRepositoriesV2, LocalDataSourcesV2, RemoteDataSources } from '@chatic/data';
import { createRepositoriesV2 } from '@chatic/data';

export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    contextProvider: DataContextProvider;
}): DataRepositoriesV2 =>
    createRepositoriesV2({
        remoteDataSources,
        localDataSources,
        context: contextProvider,
    });
