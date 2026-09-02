import type {
    DataContextProvider,
    DataRepositoriesV2,
    DataRepositoriesV2Options,
    HttpDataSources,
    LocalDataSourcesV2,
    SocketDataSources,
} from '@chatic/data';
import { createRepositoriesV2 } from '@chatic/data';

export const createRepositories = ({
    socketDataSources,
    localDataSources,
    contextProvider,
    options,
    httpDataSources,
}: {
    socketDataSources: SocketDataSources;
    localDataSources: LocalDataSourcesV2;
    contextProvider: DataContextProvider;
    options?: DataRepositoriesV2Options;
    httpDataSources?: HttpDataSources;
}): DataRepositoriesV2 =>
    createRepositoriesV2({
        socketDataSources,
        localDataSources,
        context: contextProvider,
        options,
        httpDataSources,
    });
