import { foreignDropAggregator, type ForeignDropSource } from '@chatic/logger';
import { isForeignContext } from './scopeGuards';

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

export interface DataContext {
    cid?: string;
    sid?: string;
    uid?: string;
    socketCid?: string;

    [key: string]: unknown;
}

export interface DataContextProvider {
    getContext(): DataContext;

    setContext(context: DataContext): void;
}

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

    protected acceptsAnswer(requestContext: DataContext, source: ForeignDropSource): boolean {
        if (!isForeignContext(requestContext)) return true;
        foreignDropAggregator.record({
            source,
            cid: requestContext.cid ?? 'default',
            socketCid: requestContext.socketCid ?? 'none',
        });
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op; see above
    public dispose(): void {}
}
