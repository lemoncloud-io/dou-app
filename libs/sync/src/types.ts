import type {
    ClientSocketRuntime,
    ClientSocketV2,
    CreateDeviceRuntimeOptions,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';

import type { DataRepositories } from '@chatic/data';

import type { SlotKey } from '@chatic/transport';

export interface SyncWatchEntry {
    target: SyncTargetDescriptor;
    refs: number;
    cid: string;
    uid: string | null;
}

export type SyncTargetListing = SyncTargetDescriptor & { cid: string };

export interface SyncRegisterOptions {
    cid?: string;
}

export type SyncRuntimeOptions = Pick<
    CreateDeviceRuntimeOptions,
    'keepAliveOptions' | 'reconnectOptions' | 'rotationOptions' | 'devicePlanOptions' | 'gateSyncOnAuth'
>;

export interface SyncManagerDeps {
    buildSyncPlans?: (slot: SlotKey) => DomainSyncPlan[];
    getUid?: (cid: string) => string | null;
    getSessionUid?: () => string | null;
    getCid?: () => string;
    subscribeSession?: (listener: () => void) => () => void;
    createRuntime?: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    buildTargetKey?: (target: SyncTargetDescriptor) => string;
    runtimeOptions?: SyncRuntimeOptions;
}

export interface ISyncManager {
    register(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void;
    registerDevice(id?: string, intervalMs?: number): () => void;
    registerChannel(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerChat(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerPlace(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerProfile(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    registerJoin(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void;
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown, options?: SyncRegisterOptions): void;
    listTargets(): SyncTargetListing[];
    destroy(): void;
}

export type BackgroundReceiveRepositories = Pick<DataRepositories, 'channel' | 'place' | 'syncMeta'>;

export type BackgroundReceiveTrigger = 'verified' | 'interval' | 'push' | 'resume' | 'foreground' | 'kick';

export interface BackgroundDelta {
    cid: string;
    requestedAt: number;
}

export interface BackgroundReceiverDeps {
    getRepositories?: (cid: string) => BackgroundReceiveRepositories;
    getUid?: (cid: string) => string | null;
    now?: () => number;
    intervalMs?: number;
    debounceMs?: number;
    placeRefreshMs?: number;
    onDelta?: (delta: BackgroundDelta) => void;
}
