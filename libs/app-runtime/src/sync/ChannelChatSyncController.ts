import type { DomainChannel, IChatRepositoryV2, DataRepositoriesV2 } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { SocketState } from '../socket/types';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';
import type {
    ChannelChatSyncDeps,
    IChannelChatSyncController,
    SyncChannelSnapshot,
    SyncDebugState,
    SyncRunReason,
} from './types';

const DEFAULT_INTERVAL_MS = 5000;

const createScopeKey = (binding: RuntimeBinding | null): string | null => {
    if (!binding) return null;
    const { cid, sid, uid } = binding.context;
    return `${cid}:${sid || ''}:${uid || ''}`;
};

export class ChannelChatSyncController implements IChannelChatSyncController {
    private binding: RuntimeBinding | null = null;
    private scopeKey: string | null = null;
    private lastSyncedAtByScope = new Map<string, number>();
    private started = false;
    private inFlight = false;
    private timer: ReturnType<typeof setInterval> | null = null;
    private unsubscribeSocket: (() => void) | null = null;
    private lastRunAt: number | null = null;
    private lastFullSyncAt: number | null = null;
    private pendingReason: SyncRunReason | null = null;
    private lastSocketConnected = false;
    private hasConnectedOnce = false;
    private readonly listeners = new Set<(state: SyncDebugState) => void>();

    constructor(private readonly deps: ChannelChatSyncDeps) {}

    public ensure(binding: RuntimeBinding): void {
        const nextScopeKey = createScopeKey(binding);
        const scopeChanged = this.scopeKey !== nextScopeKey;

        this.binding = binding;
        this.scopeKey = nextScopeKey;

        if (scopeChanged && nextScopeKey) {
            this.lastSyncedAtByScope.delete(nextScopeKey);
            this.hasConnectedOnce = false;
            this.pendingReason = null;
            this.lastRunAt = null;
            this.lastFullSyncAt = null;
        }

        this.emit();
    }

    public async start(): Promise<void> {
        if (this.started) return;

        this.started = true;
        this.lastSocketConnected = false;
        this.unsubscribeSocket = this.deps.socketManager.subscribe(state => {
            void this.handleSocketState(state);
        });
        this.startInterval();
        this.emit();
    }

    public stop(): void {
        this.started = false;
        this.inFlight = false;
        this.pendingReason = null;
        this.stopInterval();
        this.unsubscribeSocket?.();
        this.unsubscribeSocket = null;
        this.lastSocketConnected = false;
        this.hasConnectedOnce = false;
        this.emit();
    }

    public destroy(): void {
        this.stop();
        this.binding = null;
        this.scopeKey = null;
        this.lastSyncedAtByScope.clear();
        this.lastRunAt = null;
        this.lastFullSyncAt = null;
        this.emit();
    }

    public async requestRun(reason: SyncRunReason): Promise<void> {
        if (!this.started || !this.binding?.socket || !this.scopeKey) {
            return;
        }

        const socketState = this.deps.socketManager.getSnapshot();
        if (!socketState.isConnected || this.inFlight) {
            return;
        }

        const fullSync = reason === 'bootstrap' || reason === 'reconnect';
        const since = fullSync ? 0 : (this.lastSyncedAtByScope.get(this.scopeKey) ?? 0);
        const scopeKeyAtRequest = this.scopeKey;
        this.inFlight = true;
        this.pendingReason = reason;
        this.emit();

        try {
            const repositories = this.deps.getRepositories();
            const channelResult = await repositories.channel.refreshListSince(since);

            if (this.scopeKey !== scopeKeyAtRequest) {
                return;
            }

            const channels = await this.loadChannelSnapshots(repositories);
            await this.catchUpChats(channels, repositories.chat);

            this.lastSyncedAtByScope.set(scopeKeyAtRequest, channelResult.syncedAt);
            this.lastRunAt = this.now();
            if (fullSync) {
                this.lastFullSyncAt = this.lastRunAt;
            }
        } catch (error) {
            logger.error('SYNC', '[ChannelChatSyncController] sync run failed', {
                error,
                data: {
                    reason,
                    scopeKey: scopeKeyAtRequest,
                    since,
                },
            });
        } finally {
            this.inFlight = false;
            this.pendingReason = null;
            this.emit();
        }
    }

    public getDebugState(): SyncDebugState {
        return {
            scopeKey: this.scopeKey,
            started: this.started,
            inFlight: this.inFlight,
            lastSyncedAt: this.scopeKey ? (this.lastSyncedAtByScope.get(this.scopeKey) ?? 0) : 0,
            lastRunAt: this.lastRunAt,
            lastFullSyncAt: this.lastFullSyncAt,
            pendingReason: this.pendingReason,
        };
    }

    public subscribe(listener: (state: SyncDebugState) => void): () => void {
        this.listeners.add(listener);
        listener(this.getDebugState());
        return () => {
            this.listeners.delete(listener);
        };
    }

    private async handleSocketState(state: SocketState): Promise<void> {
        const nextConnected = state.isConnected;
        const connectedEdge = !this.lastSocketConnected && nextConnected;

        this.lastSocketConnected = nextConnected;

        if (!this.started || !connectedEdge) {
            return;
        }

        if (!this.hasConnectedOnce) {
            this.hasConnectedOnce = true;
            await this.requestRun('bootstrap');
            return;
        }

        await this.requestRun('reconnect');
    }

    private startInterval(): void {
        this.stopInterval();
        this.timer = setInterval(() => {
            if (!this.started || !this.deps.socketManager.getSnapshot().isConnected) {
                return;
            }
            void this.requestRun('interval');
        }, this.deps.intervalMs ?? DEFAULT_INTERVAL_MS);
    }

    private stopInterval(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async loadChannelSnapshots(repositories: DataRepositoriesV2): Promise<SyncChannelSnapshot[]> {
        const result = await repositories.channel.cacheReadList({});
        return (result?.list || [])
            .filter(
                (channel): channel is DomainChannel & { id: string } => typeof channel.id === 'string' && !!channel.id
            )
            .map(channel => ({
                id: channel.id,
                chatNo: channel.chatNo ?? 0,
            }));
    }

    private async catchUpChats(channels: SyncChannelSnapshot[], chatRepository: IChatRepositoryV2): Promise<void> {
        for (const channel of channels) {
            const localLatestChatNo = await this.getLocalLatestChatNo(channel.id, chatRepository);
            const serverChatNo = channel.chatNo ?? 0;

            if (serverChatNo <= localLatestChatNo) {
                continue;
            }

            await chatRepository.refreshList({ channelId: channel.id, limit: 50 });
        }
    }

    private async getLocalLatestChatNo(channelId: string, chatRepository: IChatRepositoryV2): Promise<number> {
        const result = await chatRepository.cacheReadList({ channelId, limit: 1 });
        return result?.list?.[0]?.chatNo ?? 0;
    }
    private now(): number {
        return this.deps.now?.() ?? Date.now();
    }

    private emit(): void {
        const state = this.getDebugState();
        for (const listener of this.listeners) {
            listener(state);
        }
    }
}
