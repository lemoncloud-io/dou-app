import type { DataRepositoriesV2, DomainChannel } from '@chatic/data';
import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { ISocketManager } from '../socket/types';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';

export type SyncRunReason = 'bootstrap' | 'reconnect' | 'interval' | 'manual';

export interface SyncDebugState {
    scopeKey: string | null;
    started: boolean;
    inFlight: boolean;
    lastSyncedAt: number;
    lastRunAt: number | null;
    lastFullSyncAt: number | null;
    pendingReason: SyncRunReason | null;
}

export interface ChannelChatSyncDeps {
    socketManager: ISocketManager;
    getRepositories(): DataRepositoriesV2;
    now?: () => number;
    intervalMs?: number;
}

export interface SyncChannelSnapshot extends Pick<DomainChannel, 'id' | 'chatNo'> {}

export interface ChannelChatSyncTarget extends SyncTargetDescriptor {
    type: 'channel-chat';
}

export interface ChannelChatSyncSnapshot {
    lastSyncedAt: number;
}

export interface IChannelChatSyncController {
    ensure(binding: RuntimeBinding): void;
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
    requestRun(reason: SyncRunReason): Promise<void>;
    getDebugState(): SyncDebugState;
    subscribe(listener: (state: SyncDebugState) => void): () => void;
}
