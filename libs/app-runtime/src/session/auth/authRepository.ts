import type { IAuthRepository } from '@chatic/data';

/**
 * Where `session/auth` gets its `AuthRepository`.
 *
 * **Why it is handed in.** The repository graph is assembled in `data/`, which sits above this layer:
 * it builds its socket data sources from the socket manager and its scope from the session, and the
 * auth use cases sit beside those, not under them. Importing `data/runtime` from here was an upward
 * edge, so `initAppRuntime()` hands the accessor down instead and this file imports nothing at runtime.
 *
 * The accessor is a function, resolved on every call: the graph is built lazily on first access, so a
 * captured instance could pin a graph that does not exist yet.
 *
 * Unwired is a loud failure, not a quiet one. There is no "safe" answer for a login with no
 * repository, and the message names the call that was skipped.
 */
export interface IAuthRepositorySource {
    /** Installs the accessor. Passing null unwires it (test teardown). */
    provide(get: (() => IAuthRepository) | null): void;
    /** The repository, through the accessor installed at boot. Throws when nothing was installed. */
    get(): IAuthRepository;
}

class AuthRepositorySource implements IAuthRepositorySource {
    private accessor: (() => IAuthRepository) | null = null;

    provide(get: (() => IAuthRepository) | null): void {
        this.accessor = get;
    }

    get(): IAuthRepository {
        if (!this.accessor) {
            throw new Error('[session/auth] no AuthRepository — initAppRuntime() wires it before anything logs in');
        }
        return this.accessor();
    }
}

export const authRepositorySource: IAuthRepositorySource = new AuthRepositorySource();
