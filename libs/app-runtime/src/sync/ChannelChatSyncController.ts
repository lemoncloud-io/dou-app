import {
    DomainSyncScheduler,
    type ClientSocketV2,
    type SharedTimerScheduler,
    type DomainSyncContext,
} from '@lemoncloud/chatic-sockets-lib';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';
import { ChannelChatSyncPlan } from './ChannelChatSyncPlan';
import type {
    ChannelChatSyncDeps,
    ChannelChatSyncTarget,
    IChannelChatSyncController,
    SyncDebugState,
    SyncRunReason,
} from './types';

const DEFAULT_INTERVAL_MS = 5000;

class CustomTimerScheduler implements SharedTimerScheduler {
    private timers = new Map<string, any>();

    public schedule(key: string, delayMs: number, task: () => void | Promise<void>): void {
        this.cancel(key);
        if (delayMs === 0) {
            const promise = Promise.resolve().then(() => {
                if (this.timers.get(key) === promise) {
                    this.timers.delete(key);
                    void task();
                }
            });
            this.timers.set(key, promise);
        } else {
            const timer = setTimeout(() => {
                this.timers.delete(key);
                void task();
            }, delayMs);
            this.timers.set(key, timer);
        }
    }

    public cancel(key: string): void {
        const timer = this.timers.get(key);
        if (timer) {
            if (typeof timer === 'number' || (typeof timer === 'object' && timer !== null && 'ref' in timer)) {
                clearTimeout(timer);
            }
            this.timers.delete(key);
        }
    }

    public cancelAll(prefix?: string): void {
        for (const key of this.timers.keys()) {
            if (!prefix || key.startsWith(prefix)) {
                this.cancel(key);
            }
        }
    }
}

const createScopeKey = (binding: RuntimeBinding | null): string | null => {
    if (!binding) return null;
    const { cid, sid, uid } = binding.context;
    return `${cid}:${sid || ''}:${uid || ''}`;
};

export class ChannelChatSyncController implements IChannelChatSyncController {
    private scopeKey: string | null = null;
    private lastSyncedAtByScope = new Map<string, number>();
    private started = false;
    private inFlight = false;
    private lastRunAt: number | null = null;
    private lastFullSyncAt: number | null = null;
    private pendingReason: SyncRunReason | null = null;
    private hasConnectedOnce = false;
    private readonly listeners = new Set<(state: SyncDebugState) => void>();

    private scheduler: DomainSyncScheduler | null = null;
    private unsubscribeClient: (() => void) | null = null;
    private readonly syncPlan: ChannelChatSyncPlan;
    private readonly timerScheduler: CustomTimerScheduler;
    private activeTarget: ChannelChatSyncTarget | null = null;

    constructor(private readonly deps: ChannelChatSyncDeps) {
        this.timerScheduler = new CustomTimerScheduler();
        this.syncPlan = new ChannelChatSyncPlan({
            getRepositories: this.deps.getRepositories,
            onConnected: () => {
                if (this.scopeKey) {
                    this.lastSyncedAtByScope.set(this.scopeKey, 0);
                }
            },
            onSyncStart: () => {
                if (!this.pendingReason) {
                    this.pendingReason = this.hasConnectedOnce ? 'interval' : 'bootstrap';
                    if (!this.hasConnectedOnce) {
                        this.hasConnectedOnce = true;
                    }
                }
                this.inFlight = true;
                this.emit();
            },
            onSyncSuccess: (syncedAt: number, isFullSync: boolean) => {
                if (this.scopeKey) {
                    this.lastSyncedAtByScope.set(this.scopeKey, syncedAt);
                }
                this.lastRunAt = this.now();
                if (isFullSync) {
                    this.lastFullSyncAt = this.lastRunAt;
                }
            },
            onSyncFinished: () => {
                this.inFlight = false;
                this.pendingReason = null;
                this.emit();
            },
        });
    }

    public ensure(binding: RuntimeBinding): void {
        const nextScopeKey = createScopeKey(binding);
        const scopeChanged = this.scopeKey !== nextScopeKey;

        this.scopeKey = nextScopeKey;

        if (scopeChanged && nextScopeKey) {
            this.lastSyncedAtByScope.delete(nextScopeKey);
            this.hasConnectedOnce = false;
            this.pendingReason = null;
            this.lastRunAt = null;
            this.lastFullSyncAt = null;

            if (this.activeTarget && this.scheduler) {
                this.scheduler.stop(this.activeTarget);
            }

            this.activeTarget = {
                type: 'channel-chat',
                id: nextScopeKey,
                intervalMs: this.deps.intervalMs ?? DEFAULT_INTERVAL_MS,
            };

            if (this.started && this.scheduler) {
                this.scheduler.start(this.activeTarget);
            }
        }

        this.emit();
    }

    public async start(): Promise<void> {
        if (this.started) return;

        this.started = true;
        this.hasConnectedOnce = false;

        this.unsubscribeClient = this.deps.socketManager.subscribeClient(client => {
            this.handleClientChanged(client);
        });

        this.emit();
    }

    public stop(): void {
        this.started = false;
        this.inFlight = false;
        this.pendingReason = null;

        if (this.activeTarget && this.scheduler) {
            this.scheduler.stop(this.activeTarget);
        }

        if (this.scheduler) {
            this.scheduler.destroy();
            this.scheduler = null;
        }

        this.timerScheduler.cancelAll();
        this.unsubscribeClient?.();
        this.unsubscribeClient = null;
        this.emit();
    }

    public destroy(): void {
        this.stop();
        this.scopeKey = null;
        this.activeTarget = null;
        this.lastSyncedAtByScope.clear();
        this.lastRunAt = null;
        this.lastFullSyncAt = null;
        this.emit();
    }

    public async requestRun(reason: SyncRunReason): Promise<void> {
        if (!this.started || !this.activeTarget) {
            return;
        }

        const socketState = this.deps.socketManager.getSnapshot();
        if (!socketState.isConnected || this.inFlight) {
            return;
        }

        this.pendingReason = reason;
        this.emit();

        const manualCtx: DomainSyncContext = {
            client: this.deps.socketManager.getClient()!,
            now: () => this.now(),
            readSnapshot: <T>(t: any): T | undefined => {
                const lastSyncedAt = this.lastSyncedAtByScope.get(this.scopeKey ?? '') ?? 0;
                return { lastSyncedAt } as any;
            },
            writeSnapshot: <T>(t: any, snapshot: T | undefined) => {
                if (this.scopeKey && snapshot) {
                    const lastSyncedAt = (snapshot as any).lastSyncedAt ?? 0;
                    this.lastSyncedAtByScope.set(this.scopeKey, lastSyncedAt);
                }
                if (this.scheduler) {
                    this.scheduler.updateLocalSnapshot(t, snapshot);
                }
            },
            requestResync: async () => {
                // No-op for manual runs
            },
        };

        try {
            await this.syncPlan.run(this.activeTarget, manualCtx);
        } finally {
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

    private handleClientChanged(client: ClientSocketV2 | null) {
        if (this.scheduler) {
            this.scheduler.destroy();
            this.scheduler = null;
        }

        if (client) {
            this.scheduler = new DomainSyncScheduler({
                client,
                plans: [this.syncPlan],
                now: this.deps.now,
                timerScheduler: this.timerScheduler,
            });

            if (this.activeTarget) {
                this.scheduler.start(this.activeTarget);
            }
        }
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
