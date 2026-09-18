import type { DataContext, DataContextProvider, DataRepositories, DataRepositoriesOptions } from '@chatic/data';
import { createRepositories } from '@chatic/data';

import { ActiveScope, deriveSelectedContext } from '../session/scope';
import { getCommittedCloudId } from '../session/store';
import { createHttpDataSources } from './factories/httpFactory';
import { createLocalDataSources } from './factories/localFactory';
import { createSocketDataSources } from './factories/socketFactory';
import type { CacheAssemblyOptions, IDataManager } from './types';
import { getSocketManager } from '../socket/runtime';

export class DataManager implements IDataManager {
    private readonly repositories: DataRepositories;

    constructor(repositoryOptions?: DataRepositoriesOptions, cacheOptions?: CacheAssemblyOptions) {
        const { socketDataSources } = createSocketDataSources();
        // Local sources get the SELECTED scope only — no `socketCid`. Their job is to key cache partitions
        // (`${type}:${cid}:${uid}:${id}`), and the bound-socket view is a repository-level judgement.
        const selectedContextProvider: DataContextProvider = {
            getContext: deriveSelectedContext,
            setContext: () => undefined,
        };
        const localDataSources = createLocalDataSources({
            contextProvider: selectedContextProvider,
            cache: cacheOptions,
        });
        // Late Step 2 (ADR-0070) — no app-visible change until Step 4, when the REST hooks actually
        // move over: the repository is assembled with this data source present, but there is no
        // consumer of it before Step 4.
        const { httpDataSources } = createHttpDataSources();

        // Repositories see the scope, not the raw holder: it augments the intent with the live
        // socket's bound cloud (socketCid), so a refresh/sync running while the socket still serves
        // the OUTGOING cloud (cid already flipped optimistically) can detect the mismatch and skip
        // the write instead of poisoning the target partition. Replaces the anonymous
        // `socketAwareProvider` glue that used to live here (ADR-0070 Decision 7).
        // `getSocketManager()` is resolved per call, not captured: the runtime is assembled lazily,
        // so holding the instance from construction time would pin a manager that may not exist yet
        // (and would miss a runtime re-configure). Mirrors the previous inline glue exactly.
        const scope = new ActiveScope(
            deriveSelectedContext,
            { getBoundCid: () => getSocketManager().getBoundCid() },
            getCommittedCloudId
        );

        this.repositories = createRepositories({
            socketDataSources,
            localDataSources,
            context: scope,
            options: repositoryOptions,
            httpDataSources,
        });
    }

    public getRepositories(): DataRepositories {
        return this.repositories;
    }

    public getContext(): DataContext {
        return deriveSelectedContext();
    }
}
