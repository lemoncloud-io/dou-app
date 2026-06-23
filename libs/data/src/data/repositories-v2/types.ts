import type { DataContext, DataContextProvider } from '../repositories';

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

export interface DisposableRepositoryV2 {
    dispose(): void;
}

export abstract class BaseRepositoryV2 {
    private readonly serialTasks = new Map<string, Promise<void>>();

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
        throw new Error(`[RepositoryV2] ${fieldName} is required.`);
    }

    protected runInBackground(task: () => Promise<unknown>, label: string): void {
        void task().catch(error => {
            console.error(`[RepositoryV2:${label}] background task failed`, error);
        });
    }

    protected runInBackgroundSerial(key: string, task: () => Promise<unknown>, label: string): void {
        const previous = this.serialTasks.get(key) ?? Promise.resolve();
        const current = previous
            .catch(() => undefined)
            .then(async () => {
                await task();
            })
            .catch(error => {
                console.error(`[RepositoryV2:${label}] background task failed`, error);
            })
            .finally(() => {
                if (this.serialTasks.get(key) === current) {
                    this.serialTasks.delete(key);
                }
            });
        this.serialTasks.set(key, current);
    }

    public dispose(): void {
        this.serialTasks.clear();
    }
}
