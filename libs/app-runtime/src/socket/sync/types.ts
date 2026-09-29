import type {
    ClientSocketRuntime,
    ClientSocketV2,
    CreateDeviceRuntimeOptions,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

import type { DataRepositories } from '@chatic/data';

import type { SlotKey } from '../types';

export interface SyncWatchEntry {
    target: SyncTargetDescriptor;
    refs: number;
    /**
     * The cloud this target belongs to — the partition its plan writes into, and the slot whose runtime
     * runs it. Fixed at registration: a target never moves to another slot. Callers name it; the
     * default is the cloud the session has selected when the target is registered, because that is
     * the cloud whose rows the registering screen renders.
     */
    cid: string;
    /**
     * The uid the target was registered under, or null when there was none: the uid this account has
     * in `cid` when the caller named the cloud, the session's uid when it did not (such a caller built
     * the target's ids from the session). The SECOND scope axis: `cid` alone cannot see an account change — a relay session stays on cid
     * `'default'` across a guest→social promotion or a logout→login, so a target registered by the
     * previous account passed every guard and kept polling ids built from the old uid. The server
     * answers those with `403 not allowed to read join`.
     */
    uid: string | null;
}

/** A registered target as `listTargets` reports it: the descriptor, and the cloud it belongs to. */
export type SyncTargetListing = SyncTargetDescriptor & { cid: string };

/** How a target is registered. */
export interface SyncRegisterOptions {
    /** The cloud the target belongs to. Defaults to the cloud the session has selected right now. */
    cid?: string;
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
    /** The uid this account has in `cid`, which targets of that cloud are scoped to. Defaults to the session store. */
    getUid?: (cid: string) => string | null;
    /**
     * The session's own uid — the active token's. A target registered without a cloud is tagged with
     * it, and a change to it clears remembered channel refusals, which are keyed by channel id alone.
     * Defaults to the session store.
     */
    getSessionUid?: () => string | null;
    /** The selected cloud a target defaults to. Injected for tests; defaults to the session store. */
    getCid?: () => string;
    /** Session-change subscription, so an account change can retire the previous account's targets. */
    subscribeSession?: (listener: () => void) => () => void;
    createRuntime?: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    buildTargetKey?: (target: SyncTargetDescriptor) => string;
    runtimeOptions?: SyncRuntimeOptions;
}

export interface ISyncManager {
    register(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void;
    registerDevice(id?: string, intervalMs?: number): () => void;
    // The shorthands below take the same options as `register`: pass `{ cid }` whenever the caller
    // knows the cloud the target is for, so it cannot land on whichever cloud is selected when the
    // effect happens to run.
    registerChannel(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerChat(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerPlace(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerProfile(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerJoin(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    // Generic baseline bridge — delegates to the runtime of the target's cloud slot (no-op when that
    // slot is not bound). Domain-shaped snapshots (chat `{ lastNo }`, others `{ updatedAt }`/`{ tick }`)
    // are built by the caller.
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown, options?: SyncRegisterOptions): void;
    listTargets(): SyncTargetListing[];
    destroy(): void;
}

/** The repositories a background cloud's receive loop reads and writes — one cloud's scoped graph. */
export type BackgroundReceiveRepositories = Pick<DataRepositories, 'channel' | 'place' | 'syncMeta'>;

/** What made a receive loop ask for its cloud's delta — carried into the log line, nothing more. */
export type BackgroundReceiveTrigger = 'verified' | 'interval' | 'push' | 'resume' | 'foreground';

/** Test seams for `BackgroundReceiver`. Every one defaults to the production collaborator. */
export interface BackgroundReceiverDeps {
    /** The scoped repository graph of `cid` (`DataManager.getScopedRepositories`). */
    getRepositories?: (cid: string) => BackgroundReceiveRepositories;
    /** The uid the account has in `cid`, read per run (`getUidInCloud`). */
    getUid?: (cid: string) => string | null;
    now?: () => number;
    intervalMs?: number;
    debounceMs?: number;
    placeRefreshMs?: number;
}
