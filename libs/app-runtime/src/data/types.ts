import type { DataContext, DataRepositoriesV2 } from '@chatic/data';

// There is no direct-gateway escape hatch. Every read and write goes through a repository so the
// access surface stays one shape (ADR-0036); the ADR-0033 carve-out for relay invites and the
// identity packets is gone — InviteRepositoryV2 / AuthRepositoryV2 front them now, remote-only.

/**
 * `ensure(context)` and `destroy()` are gone. They had already become no-ops when the scope moved to
 * read-time derivation (ADR-0070 결정 7) — there is nothing to commit and nothing local to reset —
 * and a method that accepts a context while ignoring it invites a caller to believe pushing one
 * works. Clearing the SESSION is the logout path's job; the scope follows it.
 */
export interface IDataManager {
    getRepositories(): DataRepositoriesV2;
    getContext(): DataContext;
}
