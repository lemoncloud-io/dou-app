import type {
    DataContextProvider,
    DataRepositoriesV2,
    DataRepositoriesV2Options,
    LocalDataSourcesV2,
    RemoteDataSources,
} from '@chatic/data';
import { createRepositoriesV2 } from '@chatic/data';

export const createRepositories = ({
    remoteDataSources,
    localDataSources,
    contextProvider,
    options,
}: {
    remoteDataSources: RemoteDataSources;
    localDataSources: LocalDataSourcesV2;
    contextProvider: DataContextProvider;
    options?: DataRepositoriesV2Options;
}): DataRepositoriesV2 =>
    createRepositoriesV2({
        remoteDataSources,
        localDataSources,
        context: contextProvider,
        options,
    });
