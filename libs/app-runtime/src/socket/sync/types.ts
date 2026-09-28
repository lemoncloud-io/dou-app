import type {
    ClientSocketRuntime,
    ClientSocketV2,
    CreateDeviceRuntimeOptions,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

import type { SlotKey } from '../types';

export interface SyncWatchEntry {
    target: SyncTargetDescriptor;
    refs: number;
    /**
     * The cloud the session had selected when this target was registered — the partition its plan
     * writes into — or null (cid-agnostic) when an injected reader returns none. It is deliberately
     * NOT the active slot's boundCid: mid-switch the two differ, and the target belongs to the data
     * the screen shows, not to whichever socket happened to be active. A target only (re)syncs on the
     * client whose boundCid matches — so a cloud channel is never run on the relay socket, whether
     * after a cloud logout (multi-socket-design.md §8-a trap #2) or while a switch into it is still
     * bringing its slot up.
     */
    cid: string | null;
    /**
     * The user id this target was registered under, or null when there was no session. It is the
     * SECOND scope axis, and it exists because `cid` alone cannot see an account change: a relay
     * session stays on cid `'default'` across a guest→social promotion or a logout→login, so a
     * target registered by the previous account passed every guard and kept polling ids built from
     * the old uid. The server answers those with `403 not allowed to read join`.
     */
    uid: string | null;
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
    /** Builds one slot's plans; `slot` is the cloud that slot serves. */
    buildSyncPlans?: (slot: SlotKey) => DomainSyncPlan[];
    /** The session uid targets are scoped to. Injected for tests; defaults to the session store. */
    getUid?: () => string | null;
    /** The selected cloud targets are scoped to. Injected for tests; defaults to the session store. */
    getCid?: () => string | null;
    /** Session-change subscription, so an account change can retire the previous account's targets. */
    subscribeSession?: (listener: () => void) => () => void;
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
