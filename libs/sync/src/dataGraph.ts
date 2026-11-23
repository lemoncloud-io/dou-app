import type { DataContext, DataRepositories } from '@chatic/data';

export interface SyncDataGraph {
    getScopedRepositories(cid: string): DataRepositories;
    getScopedContext(cid: string): DataContext;
}

export interface ISyncDataGraphSource {
    provide(get: (() => SyncDataGraph) | null): void;
    get(): SyncDataGraph;
}

class SyncDataGraphSource implements ISyncDataGraphSource {
    private accessor: (() => SyncDataGraph) | null = null;

    provide(get: (() => SyncDataGraph) | null): void {
        this.accessor = get;
    }

    get(): SyncDataGraph {
        if (!this.accessor) {
            throw new Error('[sync] no repository graph — createRuntime() wires it before any sync runs');
        }
        return this.accessor();
    }
}

export const syncDataGraph: ISyncDataGraphSource = new SyncDataGraphSource();
