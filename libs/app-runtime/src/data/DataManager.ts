import type { DataContext, DataContextProvider, DataRepositoriesV2, DataRepositoriesV2Options } from '@chatic/data';

import { ActiveScope, deriveIntent } from '../session/scope';
import { getCommittedCloudId } from '../session/store';
import { createHttpDataSources } from './factories/httpFactory';
import { type CacheAssemblyOptions, createLocalDataSources } from './factories/localFactory';
import { createSocketDataSources } from './factories/socketFactory';
import { createRepositories } from './factories/repositoryFactory';
import type { IDataManager } from './types';
import { getSocketManager } from '../socket/runtime';

export class DataManager implements IDataManager {
    private readonly repositories: DataRepositoriesV2;

    constructor(repositoryOptions?: DataRepositoriesV2Options, cacheOptions?: CacheAssemblyOptions) {
        const { socketDataSources } = createSocketDataSources();
        // Local sources get the INTENT only — no `socketCid`. Their job is to key cache partitions
        // (`${type}:${cid}:${uid}:${id}`), and the bound-socket view is a repository-level judgement.
        const intentProvider: DataContextProvider = { getContext: deriveIntent, setContext: () => undefined };
        const localDataSources = createLocalDataSources({ contextProvider: intentProvider, cache: cacheOptions });
        // 2단계 후반(ADR-0070) — REST 훅이 실제로 옮겨오는 4단계 전까지는 앱 무변경: repository는
        // 이 데이터소스가 있는 채로 조립되지만, 4단계 전 소비자는 없다.
        const { httpDataSources } = createHttpDataSources();

        // Repositories see the scope, not the raw holder: it augments the intent with the live
        // socket's bound cloud (socketCid), so a refresh/sync running while the socket still serves
        // the OUTGOING cloud (cid already flipped optimistically) can detect the mismatch and skip
        // the write instead of poisoning the target partition. Replaces the anonymous
        // `socketAwareProvider` glue that used to live here (ADR-0070 결정 7).
        // `getSocketManager()` is resolved per call, not captured: the runtime is assembled lazily,
        // so holding the instance from construction time would pin a manager that may not exist yet
        // (and would miss a runtime re-configure). Mirrors the previous inline glue exactly.
        const scope = new ActiveScope(
            deriveIntent,
            { getBoundCid: () => getSocketManager().getBoundCid() },
            getCommittedCloudId
        );

        this.repositories = createRepositories({
            socketDataSources,
            localDataSources,
            contextProvider: scope,
            options: repositoryOptions,
            httpDataSources,
        });
    }

    public getRepositories(): DataRepositoriesV2 {
        return this.repositories;
    }

    public getContext(): DataContext {
        return deriveIntent();
    }
}
