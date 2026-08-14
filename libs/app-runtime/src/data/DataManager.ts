import type { DataContext, DataContextProvider, DataRepositoriesV2, DataRepositoriesV2Options } from '@chatic/data';
import { DataContextHolder } from '@chatic/data';

import { type CacheAssemblyOptions, createLocalDataSources } from './factories/localFactory';
import { createRemoteDataSources } from './factories/remoteFactory';
import { createRepositories } from './factories/repositoryFactory';
import type { IDataManager } from './types';
import { DEFAULT_CONTEXT } from './types';
import { getSocketManager } from '../socket/runtime';

export class DataManager implements IDataManager {
    private readonly contextHolder: DataContextProvider;
    private readonly repositories: DataRepositoriesV2;

    constructor(
        initialContext: DataContext = DEFAULT_CONTEXT,
        repositoryOptions?: DataRepositoriesV2Options,
        cacheOptions?: CacheAssemblyOptions
    ) {
        this.contextHolder = new DataContextHolder(initialContext);

        const { remoteDataSources } = createRemoteDataSources();
        const localDataSources = createLocalDataSources({ contextProvider: this.contextHolder, cache: cacheOptions });

        // Repositories see a context augmented with the live socket's bound cloud (socketCid), so
        // a refresh/sync that runs while the socket still serves the OUTGOING cloud (cid already
        // flipped optimistically) can detect the mismatch and skip the write instead of poisoning
        // the target cloud's partition. Read live per-call so it tracks socket rebinds.
        const socketAwareProvider: DataContextProvider = {
            getContext: () => {
                const base = this.contextHolder.getContext();
                const socketCid = getSocketManager().getBoundCid();
                return socketCid != null ? { ...base, socketCid } : base;
            },
            setContext: context => this.contextHolder.setContext(context),
        };

        this.repositories = createRepositories({
            remoteDataSources,
            localDataSources,
            contextProvider: socketAwareProvider,
            options: repositoryOptions,
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
