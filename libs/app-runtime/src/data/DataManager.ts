import type { DataContext, DataContextProvider, DataRepositoriesV2 } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';

import { createLocalDataSources } from './factories/localFactory';
import { createRemoteDataSources } from './factories/remoteFactory';
import { createRepositories } from './factories/repositoryFactory';
import type { IDataManager } from './types';
import { DEFAULT_CONTEXT } from './types';

export class DataManager implements IDataManager {
    private readonly contextHolder: DataContextProvider;
    private readonly repositories: DataRepositoriesV2;

    constructor(initialContext: DataContext = DEFAULT_CONTEXT) {
        this.contextHolder = new DataContextHolder(initialContext);

        const { remoteDataSources } = createRemoteDataSources();
        const localDataSources = createLocalDataSources({ contextProvider: this.contextHolder });

        this.repositories = createRepositories({
            remoteDataSources,
            localDataSources,
            contextProvider: this.contextHolder,
        });
    }

    public ensure(context: DataContext): DataRepositoriesV2 {
        this.contextHolder.setContext(context);
        return this.repositories;
    }

    public getRepositories(): DataRepositoriesV2 {
        return this.repositories;
    }

    public getContext(): DataContext {
        return this.contextHolder.getContext();
    }

    public destroy(): void {
        this.contextHolder.setContext(DEFAULT_CONTEXT);
    }
}
