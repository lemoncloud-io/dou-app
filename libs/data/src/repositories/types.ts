export const createSnapshotDataContextProvider = (context: DataContext): DataContextProvider => {
    const snapshot = { ...context };
    return {
        getContext(): DataContext {
            return snapshot;
        },
        setContext(): void {
            // Snapshot-bound providers ignore later mutations by design.
        },
    };
};

/**
 * The execution context shared by the whole repository layer.
 * `cid` is the currently connected cloud, `sid` the selected place, `uid` the current user.
 * It is injected into repositories so that server requests and, later, local cache partitioning policy
 * can refer to one common source.
 */
export interface DataContext {
    /** The currently connected cloud id. */
    cid?: string;
    /** The currently selected place id. */
    sid?: string;
    /** The current user id. */
    uid?: string;
    /** The cloud id the currently attached socket is bound to (the committed cloud). When it differs from `cid`, the socket is still on the old cloud. */
    socketCid?: string;

    /** Extension field, for a domain that needs extra context. */
    [key: string]: unknown;
}

/**
 * The contract that has a repository read the current context through a provider rather than holding
 * it. Even when the context object itself is replaced, a repository reads the value current at the
 * moment `getContext()` is called.
 */
export interface DataContextProvider {
    getContext(): DataContext;

    setContext(context: DataContext): void;
}

/**
 * The mutable context holder updated by the surrounding environment (a web provider, for instance).
 * Repository instances reference this holder, so a change to cid/sid/uid requires no rebuild.
 */
export class DataContextHolder implements DataContextProvider {
    constructor(private context: DataContext) {}

    public getContext(): DataContext {
        return this.context;
    }

    public setContext(context: DataContext): void {
        this.context = context;
    }
}

export interface DisposableRepository {
    dispose(): void;
}

export abstract class BaseRepository {
    protected constructor(private readonly context: DataContextProvider) {}

    protected getRepositoryContext(): DataContext {
        return this.context?.getContext() ?? {};
    }

    protected getRequestContext(): DataContext {
        return { ...this.getRepositoryContext() };
    }

    protected getNormalizedContext(context: DataContext = this.getRepositoryContext()): DataContext {
        // V2 repositories normalize identifiers to cid/sid/uid before delegating work.
        return {
            cid: context.cid || 'default',
            sid: typeof context.sid === 'string' ? context.sid : undefined,
            uid: typeof context.uid === 'string' ? context.uid : undefined,
        };
    }

    protected assertRequiredString(value: string | undefined, fieldName: string): string {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        throw new Error(`[Repository] ${fieldName} is required.`);
    }

    /**
     * Teardown hook. Nothing to release at this level today — it stays because
     * `DisposableRepository` declares it and the factory tears every
     * repository down through it (`repositories/index.ts`), so a subclass
     * that acquires something has a place to release it.
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op; see above
    public dispose(): void {}
}
