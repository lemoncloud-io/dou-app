import type { DataContextProvider, DataRepositoriesV2, LocalDataSourcesV2 } from '@chatic/data';
import type { RemoteDataSources } from '@chatic/data';

export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    contextProvider: DataContextProvider;
}): DataRepositoriesV2 =>
    createDataRepositories({
        remoteDataSources,
        localDataSources,
        context: contextProvider,
    });
