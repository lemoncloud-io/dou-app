import type { DomainScope } from '../domain';

export interface RepositoryV2DataContext {
    cid?: string;
    sid?: string;
    uid?: string;
    [key: string]: unknown;
}

export interface DataContextProviderV2 {
    getContext(): RepositoryV2DataContext;
    setContext(context: RepositoryV2DataContext): void;
}

export interface RepositoryRefreshResult {
    wroteCount: number;
}

export interface DisposableRepositoryV2 {
    dispose(): void;
}

export abstract class BaseRepositoryV2 {
    private readonly serialTasks = new Map<string, Promise<void>>();

    protected constructor(private readonly context: DataContextProviderV2) {}

    protected getRepositoryContext(): RepositoryV2DataContext {
        return this.context?.getContext() ?? {};
    }

    protected getDomainScope(): DomainScope {
        return this.getDomainScopeFromContext(this.getRepositoryContext());
    }

    protected getRepositoryContextSnapshot(): RepositoryV2DataContext {
        return { ...this.getRepositoryContext() };
    }

    protected getDomainScopeFromContext(context: RepositoryV2DataContext): DomainScope {
        // V2 repositories normalize identifiers to cid/sid/uid before delegating work.
        return {
            cid: context.cid || 'default',
            sid: typeof context.sid === 'string' ? context.sid : undefined,
            uid: typeof context.uid === 'string' ? context.uid : undefined,
        };
    }

    protected isSameContext(requestContext: RepositoryV2DataContext): boolean {
        const current = this.getRepositoryContext();
        return (
            current.cid === requestContext.cid &&
            current.sid === requestContext.sid &&
            current.uid === requestContext.uid
        );
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
