import {
    DomainSyncScheduler,
    type ClientSocketV2,
    type SharedTimerScheduler,
    type DomainSyncContext,
} from '@lemoncloud/chatic-sockets-lib';
import type { RuntimeBinding } from '../runtime/useRuntimeBinding';
import { ChannelChatSyncPlan } from './ChannelChatSyncPlan';
import { SiteSyncPlan } from './SiteSyncPlan';
import { ProfileSyncPlan } from './ProfileSyncPlan';
import type {
    RuntimeSyncDeps,
    ChannelChatSyncTarget,
    SiteSyncTarget,
    ProfileSyncTarget,
    IRuntimeSyncController,
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

export class RuntimeSyncController implements IRuntimeSyncController {
    private binding: RuntimeBinding | null = null;
    private scopeKey: string | null = null;
    private lastSyncedAtByScope = new Map<string, number>();
    private started = false;
    private inFlight = false;
    private runningCount = 0;
    private lastRunAt: number | null = null;
    private lastFullSyncAt: number | null = null;
    private pendingReason: SyncRunReason | null = null;
    private hasConnectedOnce = false;
    private readonly listeners = new Set<(state: SyncDebugState) => void>();

    private scheduler: DomainSyncScheduler | null = null;
    private unsubscribeClient: (() => void) | null = null;
    private readonly timerScheduler: CustomTimerScheduler;

    private readonly channelChatPlan: ChannelChatSyncPlan;
    private readonly sitePlan: SiteSyncPlan;
    private readonly profilePlan: ProfileSyncPlan;

    private activeTarget: ChannelChatSyncTarget | null = null;
    private siteTarget: SiteSyncTarget | null = null;
    private profileTarget: ProfileSyncTarget | null = null;

    constructor(private readonly deps: RuntimeSyncDeps) {
        this.timerScheduler = new CustomTimerScheduler();

        const onSyncStart = () => {
            if (!this.pendingReason) {
                this.pendingReason = this.hasConnectedOnce ? 'interval' : 'bootstrap';
                if (!this.hasConnectedOnce) {
                    this.hasConnectedOnce = true;
                }
            }
            this.runningCount++;
            this.inFlight = this.runningCount > 0;
            this.emit();
        };

        const onSyncFinished = () => {
            this.runningCount = Math.max(0, this.runningCount - 1);
            this.inFlight = this.runningCount > 0;
            if (!this.inFlight) {
                this.pendingReason = null;
            }
            this.emit();
        };

        this.channelChatPlan = new ChannelChatSyncPlan({
            getRepositories: this.deps.getRepositories,
            onConnected: () => {
                if (this.scopeKey) {
                    this.lastSyncedAtByScope.set(this.scopeKey, 0);
                }
            },
            onSyncStart,
            onSyncSuccess: (syncedAt: number, isFullSync: boolean) => {
                if (this.scopeKey) {
                    this.lastSyncedAtByScope.set(this.scopeKey, syncedAt);
                }
                this.lastRunAt = this.now();
                if (isFullSync) {
                    this.lastFullSyncAt = this.lastRunAt;
                }
            },
            onSyncFinished,
        });

        this.sitePlan = new SiteSyncPlan({
            getRepositories: this.deps.getRepositories,
            onSyncStart,
            onSyncFinished,
        });

        this.profilePlan = new ProfileSyncPlan({
            getRepositories: this.deps.getRepositories,
            onSyncStart,
            onSyncSuccess: (syncedAt: number, isFullSync: boolean) => {
                this.lastRunAt = this.now();
                if (isFullSync) {
                    this.lastFullSyncAt = this.lastRunAt;
                }
            },
            onSyncFinished,
        });
    }

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
            this.runningCount = 0;

            if (this.scheduler) {
                this.scheduler.stopAll();
            }

            const sid = binding.context.sid;
            const uid = binding.context.uid;

            this.activeTarget = {
                type: 'channel-chat',
                id: nextScopeKey,
                intervalMs: this.deps.intervalMs ?? DEFAULT_INTERVAL_MS,
            };

            this.siteTarget = {
                type: 'site',
                id: sid || undefined,
                intervalMs: 30000,
            };

            this.profileTarget = {
                type: 'profile',
                id: uid || undefined,
                intervalMs: 60000,
            };

            if (this.started && this.scheduler) {
                if (sid) {
                    this.scheduler.start(this.activeTarget);
                }
                this.scheduler.start(this.siteTarget);
                if (sid) {
                    this.scheduler.start(this.profileTarget);
                }
            }
        }

        this.emit();
    }

    public async start(): Promise<void> {
        if (this.started) return;

        this.started = true;
        this.hasConnectedOnce = false;
        this.runningCount = 0;

        this.unsubscribeClient = this.deps.socketManager.subscribeClient(client => {
            this.handleClientChanged(client);
        });

        this.emit();
    }

    public stop(): void {
        this.started = false;
        this.inFlight = false;
        this.runningCount = 0;
        this.pendingReason = null;

        if (this.scheduler) {
            this.scheduler.stopAll();
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
        this.binding = null;
        this.scopeKey = null;
        this.activeTarget = null;
        this.siteTarget = null;
        this.profileTarget = null;
        this.lastSyncedAtByScope.clear();
        this.lastRunAt = null;
        this.lastFullSyncAt = null;
        this.emit();
    }

    public async requestRun(reason: SyncRunReason): Promise<void> {
        if (!this.started || !this.activeTarget || !this.binding?.context.sid) {
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
            await this.channelChatPlan.run(this.activeTarget, manualCtx);
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
                plans: [this.channelChatPlan, this.sitePlan, this.profilePlan],
                now: this.deps.now,
                timerScheduler: this.timerScheduler,
            });

            const sid = this.binding?.context.sid;
            if (this.activeTarget && sid) {
                this.scheduler.start(this.activeTarget);
            }
            if (this.siteTarget) {
                this.scheduler.start(this.siteTarget);
            }
            if (this.profileTarget && sid) {
                this.scheduler.start(this.profileTarget);
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
