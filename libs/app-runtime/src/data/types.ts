import type { DataContext, DataRepositoriesV2 } from '@chatic/data';

export const DEFAULT_CONTEXT: DataContext = {
    cid: 'default',
};

// There is no direct-gateway escape hatch. Every read and write goes through a repository so the
// access surface stays one shape (ADR-0036); the ADR-0033 carve-out for relay invites and the
// identity packets is gone — InviteRepositoryV2 / AuthRepositoryV2 front them now, remote-only.

export interface IDataManager {
    ensure(context: DataContext): DataRepositoriesV2;
    getRepositories(): DataRepositoriesV2;
    getContext(): DataContext;
    destroy(): void;
}
