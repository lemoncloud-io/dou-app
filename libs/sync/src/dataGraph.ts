import type { DataContext, DataRepositories } from '@chatic/data';

/**
 * The two reads sync makes of the repository graph: a cloud's repositories, and the scope they write
 * under.
 *
 * **Why it is handed in.** The graph is assembled in app-runtime's `data/`, a package above this one —
 * it builds its socket data sources from the socket manager this package runs on. Importing it from
 * here would be an upward edge, so `initAppRuntime()` hands the accessor down instead and this file
 * imports nothing at runtime. `DataManager` satisfies the interface as it is.
 */
export interface SyncDataGraph {
    getScopedRepositories(cid: string): DataRepositories;
    getScopedContext(cid: string): DataContext;
}

export interface ISyncDataGraphSource {
    /** Installs the accessor. Passing null unwires it (test teardown). */
    provide(get: (() => SyncDataGraph) | null): void;
    /** The graph, through the accessor installed at boot. Throws when nothing was installed. */
    get(): SyncDataGraph;
}

/**
 * Resolved on every call, never captured: the graph is built lazily on first access, so a captured
 * instance could pin a graph that does not exist yet. Unwired is a loud failure — a plan with no
 * repository has nowhere to write, and the message names the call that was skipped.
 */
class SyncDataGraphSource implements ISyncDataGraphSource {
    private accessor: (() => SyncDataGraph) | null = null;

    provide(get: (() => SyncDataGraph) | null): void {
        this.accessor = get;
    }

    get(): SyncDataGraph {
        if (!this.accessor) {
            throw new Error('[sync] no repository graph — initAppRuntime() wires it before any sync runs');
        }
        return this.accessor();
    }
}

export const syncDataGraph: ISyncDataGraphSource = new SyncDataGraphSource();
