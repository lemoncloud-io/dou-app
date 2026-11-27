import type {
    DataContext,
    DataContextProvider,
    DataRepositories,
    DataRepositoriesOptions,
    HttpDataSources,
    LocalDataSources,
} from '@chatic/data';
import { createRepositories } from '@chatic/data';

import { ActiveScope, deriveSelectedContext, getCommittedCloudId, getUidInCloud } from '@chatic/session';
import { createHttpDataSources } from './factories/httpFactory';
import { createLocalDataSources } from './factories/localFactory';
import { createRuntimeOutbox } from './factories/outboxFactory';
import { createSocketDataSources } from './factories/socketFactory';
import type { CacheAssemblyOptions, IDataManager } from './types';
import { getSocketManager, slotKeyOf } from '@chatic/transport';

export class DataManager implements IDataManager {
    private readonly repositories: DataRepositories;
    private readonly localDataSources: LocalDataSources;
    private readonly httpDataSources: HttpDataSources;
    private readonly scopedRepositories = new Map<string, DataRepositories>();
    private readonly repositoryOptions: DataRepositoriesOptions;

    constructor(repositoryOptions?: DataRepositoriesOptions, cacheOptions?: CacheAssemblyOptions) {
        this.repositoryOptions = {
            ...repositoryOptions,
            outbox: repositoryOptions?.outbox ?? createRuntimeOutbox(cid => this.getScopedRepositories(cid)),
        };
        const { socketDataSources } = createSocketDataSources();
        const selectedContextProvider: DataContextProvider = {
            getContext: deriveSelectedContext,
            setContext: () => undefined,
        };
        this.localDataSources = createLocalDataSources({
            contextProvider: selectedContextProvider,
            cache: cacheOptions,
        });
        this.httpDataSources = createHttpDataSources().httpDataSources;

        const scope = new ActiveScope(
            deriveSelectedContext,
            { getBoundCid: () => getSocketManager().getBoundCid() },
            getCommittedCloudId
        );

        this.repositories = createRepositories({
            socketDataSources,
            localDataSources: this.localDataSources,
            context: scope,
            options: this.repositoryOptions,
            httpDataSources: this.httpDataSources,
        });
    }

    public getRepositories(): DataRepositories {
        return this.repositories;
    }

    public getContext(): DataContext {
        return deriveSelectedContext();
    }

    public getScopedRepositories(cid: string): DataRepositories {
        let repositories = this.scopedRepositories.get(cid);
        if (!repositories) {
            const { socketDataSources } = createSocketDataSources(getSocketManager().getScopedClient(slotKeyOf(cid)));
            repositories = createRepositories({
                socketDataSources,
                localDataSources: this.localDataSources,
                context: { getContext: () => this.getScopedContext(cid), setContext: () => undefined },
                options: this.repositoryOptions,
                httpDataSources: this.httpDataSources,
            });
            this.scopedRepositories.set(cid, repositories);
        }
        return repositories;
    }

    public getScopedContext(cid: string): DataContext {
        return { cid, uid: getUidInCloud(cid) ?? undefined, socketCid: cid };
    }
}
