import type { DataContext, DataRepositories } from '@chatic/data';

// There is no direct-gateway escape hatch. Every read and write goes through a repository so the
// access surface stays one shape (ADR-0036); the ADR-0033 carve-out for relay invites and the
// identity packets is gone — InviteRepository / AuthRepository front them now, remote-only.

/**
 * `ensure(context)` and `destroy()` are gone. They had already become no-ops when the scope moved to
 * read-time derivation (ADR-0070 결정 7) — there is nothing to commit and nothing local to reset —
 * and a method that accepts a context while ignoring it invites a caller to believe pushing one
 * works. Clearing the SESSION is the logout path's job; the scope follows it.
 */
export interface IDataManager {
    getRepositories(): DataRepositories;
    getContext(): DataContext;
}

/**
 * App-level cache assembly policy, injected when the data runtime is built (`runtime.ts` passes it
 * into the `DataManager` constructor). This is the APP's policy, not the engine's — a default baked
 * into the assembler would silently apply to every client that builds a data runtime.
 *
 * Declared here rather than in `factories/localFactory.ts`, where it used to sit: it is part of
 * `AppRuntimeConfig` (an app writes it in `initAppRuntime`), so its home is the module's contract
 * file, not one assembler inside it. Four files read it, including the package barrel.
 */
export interface CacheAssemblyOptions {
    /**
     * Caps how many chat rows the web cache keeps per channel. Unset = unbounded, which is what
     * every client did before and still does unless it opts in. Only meaningful where chat is
     * served from web storage — a plain browser (`apps/web`, `apps/admin-v2`, desktop-web); inside
     * the native WebView chat always routes to native SQLite.
     */
    maxChatsPerChannel?: number;
}
