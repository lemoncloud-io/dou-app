import type {
    ClientSocketRuntime,
    ClientSocketV2,
    CreateDeviceRuntimeOptions,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

export interface SyncWatchEntry {
    target: SyncTargetDescriptor;
    refs: number;
    /**
     * The cloud id (active slot's boundCid) this target was registered under, or null when no socket
     * was bound yet (cid-agnostic). On an active-client swap, a target is only (re)synced on the
     * client whose boundCid matches — so a cloud channel is never replayed onto the relay socket after
     * a cloud logout (multi-socket-design.md §8-a trap #2).
     */
    cid: string | null;
}

/**
 * Tuning options forwarded verbatim to createDeviceRuntime. Picked from the lib
 * type so the shape stays in lockstep with the engine. The composition root
 * currently injects defaults; sourcing these from external config (connectionDraft
 * style) is deferred — this surface keeps that extension non-breaking.
 */
export type SyncRuntimeOptions = Pick<
    CreateDeviceRuntimeOptions,
    'keepAliveOptions' | 'reconnectOptions' | 'rotationOptions' | 'devicePlanOptions' | 'gateSyncOnAuth'
>;

export interface SyncManagerDeps {
    buildSyncPlans?: () => DomainSyncPlan[];
    createRuntime?: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    buildTargetKey?: (target: SyncTargetDescriptor) => string;
    runtimeOptions?: SyncRuntimeOptions;
}

export interface ISyncManager {
    register(target: SyncTargetDescriptor): () => void;
    registerDevice(id?: string, intervalMs?: number): () => void;
    registerChannel(id: string, intervalMs?: number): () => void;
    registerChat(id: string, intervalMs?: number): () => void;
    registerPlace(id: string, intervalMs?: number): () => void;
    registerProfile(id: string, intervalMs?: number): () => void;
    registerJoin(id: string, intervalMs?: number): () => void;
    // Generic baseline bridge — delegates to the active runtime (no-op when none). Domain-shaped
    // snapshots (chat `{ lastNo }`, others `{ updatedAt }`/`{ tick }`) are built by the caller.
    updateLocalSnapshot(...args: Parameters<ClientSocketRuntime['updateLocalSnapshot']>): void;
    listTargets(): SyncTargetDescriptor[];
    destroy(): void;
}
