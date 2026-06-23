import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

export interface SyncWatchEntry {
    target: SyncTargetDescriptor;
    refs: number;
}

export interface AppSyncRuntimeDeps {
    buildSyncPlans?: () => DomainSyncPlan[];
    createRuntime?: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    buildTargetKey?: (target: SyncTargetDescriptor) => string;
}

export interface IAppSyncRuntime {
    register(target: SyncTargetDescriptor): () => void;
    registerDevice(id?: string, intervalMs?: number): () => void;
    registerChannel(id: string, intervalMs?: number): () => void;
    registerChat(id: string, intervalMs?: number): () => void;
    registerPlace(id: string, intervalMs?: number): () => void;
    registerProfile(id: string, intervalMs?: number): () => void;
    listTargets(): SyncTargetDescriptor[];
    destroy(): void;
}
