import type { DataContext, DataRepositories } from '@chatic/data';

// There is no direct-gateway escape hatch. Every read and write goes through a repository so the
// access surface stays one shape (ADR-0036); the ADR-0033 carve-out for relay invites and the
// identity packets is gone — InviteRepository / AuthRepository front them now, remote-only.

/**
 * `ensure(context)` and `destroy()` are gone. They had already become no-ops when the scope moved to
 * read-time derivation (ADR-0070 Decision 7) — there is nothing to commit and nothing local to reset —
 * and a method that accepts a context while ignoring it invites a caller to believe pushing one
 * works. Clearing the SESSION is the logout path's job; the scope follows it.
 */
export interface IDataManager {
    getRepositories(): DataRepositories;
    getContext(): DataContext;
    /**
     * A repository graph pinned to one cloud: it reads and writes that cloud's partition under the uid
     * this account has there, and sends through that cloud's socket slot — whichever cloud is selected
     * or active. Built on first use and kept for the session, one per cloud.
     *
     * It shares the app graph's local data sources, so a write made through it wakes the observers a
     * screen registered through `getRepositories()`. Repository-instance state is its own: the only
     * such state today is the channel leave guard, so a leave made through the app graph is not seen
     * by a background receive loop's delta already in flight for that cloud (see docs/data).
     */
    getScopedRepositories(cid: string): DataRepositories;
    /** The context `getScopedRepositories(cid)` runs under, read at call time. */
    getScopedContext(cid: string): DataContext;
}

/** How the runtime is asked to assemble its caches — declared beside the cache's ports in `@chatic/data`. */
export type { CacheAssemblyOptions } from '@chatic/data';
