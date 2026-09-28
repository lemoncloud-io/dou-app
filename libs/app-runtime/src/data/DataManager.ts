import type {
    DataContext,
    DataContextProvider,
    DataRepositories,
    DataRepositoriesOptions,
    HttpDataSources,
    LocalDataSources,
} from '@chatic/data';
import { createRepositories } from '@chatic/data';

import { ActiveScope, deriveSelectedContext } from '../session/scope';
import { getCommittedCloudId, getUidInCloud } from '../session/store';
import { createHttpDataSources } from './factories/httpFactory';
import { createLocalDataSources } from './factories/localFactory';
import { createSocketDataSources } from './factories/socketFactory';
import type { CacheAssemblyOptions, IDataManager } from './types';
import { getSocketManager } from '../socket/runtime';
import { slotKeyOf } from '../socket/utils/slotKey';

export class DataManager implements IDataManager {
    private readonly repositories: DataRepositories;
    private readonly localDataSources: LocalDataSources;
    private readonly httpDataSources: HttpDataSources;
    private readonly scopedRepositories = new Map<string, DataRepositories>();

    constructor(
        private readonly repositoryOptions?: DataRepositoriesOptions,
        cacheOptions?: CacheAssemblyOptions
    ) {
        const { socketDataSources } = createSocketDataSources();
        // Local sources get the SELECTED scope only — no `socketCid`. Their job is to key cache partitions
        // (`${type}:${cid}:${uid}:${id}`), and the bound-socket view is a repository-level judgement.
        const selectedContextProvider: DataContextProvider = {
            getContext: deriveSelectedContext,
            setContext: () => undefined,
        };
        this.localDataSources = createLocalDataSources({
            contextProvider: selectedContextProvider,
            cache: cacheOptions,
        });
        // Late Step 2 (ADR-0070) — no app-visible change until Step 4, when the REST hooks actually
        // move over: the repository is assembled with this data source present, but there is no
        // consumer of it before Step 4.
        this.httpDataSources = createHttpDataSources().httpDataSources;

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
            localDataSources: this.localDataSources,
            context: scope,
            options: repositoryOptions,
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
            // The local sources are the app graph's own, not a copy: an observer is registered on
            // the data source instance, so a write made here has to reach the same instance to wake
            // the screen watching that partition.
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
        // `socketCid` is the cloud itself because every socket call this graph makes goes through
        // that cloud's slot, so there is no other socket whose answer could land here.
        return { cid, uid: getUidInCloud(cid) ?? undefined, socketCid: cid };
    }
}
