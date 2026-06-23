import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { SocketRuntime } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type { ISocketManager } from '../types';
import { createSyncPlans } from './plans';
import type { AppSyncRuntimeDeps, IAppSyncRuntime, SyncWatchEntry } from './types';

const defaultBuildTargetKey = (target: SyncTargetDescriptor): string => `${target.type}:${target.id ?? ''}`;
const defaultCreateRuntime = (client: ClientSocketV2, plans: DomainSyncPlan[]): ClientSocketRuntime => {
    return new SocketRuntime({
        client,
        syncPlans: plans,
    });
};

export class AppSyncRuntime implements IAppSyncRuntime {
    private readonly plans: DomainSyncPlan[];
    private readonly createRuntime: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    private readonly buildTargetKey: (target: SyncTargetDescriptor) => string;
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    private readonly unsubscribeClient: () => void;
    private runtime: ClientSocketRuntime | null = null;

    constructor(
        private readonly manager: ISocketManager,
        deps: AppSyncRuntimeDeps = {}
    ) {
        this.plans = (deps.buildSyncPlans ?? createSyncPlans)();
        this.createRuntime = deps.createRuntime ?? defaultCreateRuntime;
        this.buildTargetKey = deps.buildTargetKey ?? defaultBuildTargetKey;
        this.unsubscribeClient = this.manager.subscribeClient(client => {
            this.handleClientChanged(client);
        });
    }

    public register(target: SyncTargetDescriptor): () => void {
        const key = this.buildTargetKey(target);
        const entry = this.watchEntries.get(key);
        if (entry) {
            entry.refs += 1;
            entry.target = { ...entry.target, ...target };
        } else {
            this.watchEntries.set(key, {
                target: { ...target },
                refs: 1,
            });
            this.startTarget(target);
        }

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.unregister(key);
        };
    }

    public registerDevice(id?: string, intervalMs?: number): () => void {
        return this.register({
            type: 'device',
            ...(id ? { id } : {}),
            ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
        });
    }

    public registerChannel(id: string, intervalMs?: number): () => void {
        return this.register({
            type: 'channel',
            id,
            ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
        });
    }

    public registerPlace(id: string, intervalMs?: number): () => void {
        return this.register({
            type: 'place',
            id,
            ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
        });
    }

    public registerProfile(id: string, intervalMs?: number): () => void {
        return this.register({
            type: 'profile',
            id,
            ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
        });
    }

    public listTargets(): SyncTargetDescriptor[] {
        return [...this.watchEntries.values()].map(entry => ({ ...entry.target }));
    }

    public destroy(): void {
        this.unsubscribeClient();
        this.detachRuntime();
        this.watchEntries.clear();
    }

    private unregister(key: string): void {
        const entry = this.watchEntries.get(key);
        if (!entry) return;

        entry.refs -= 1;
        if (entry.refs > 0) return;

        this.stopTarget(entry.target);
        this.watchEntries.delete(key);
    }

    private handleClientChanged(client: ClientSocketV2 | null): void {
        this.detachRuntime();
        if (!client) return;

        this.runtime = this.createRuntime(client, this.plans);
        this.replayTargets();
    }

    private replayTargets(): void {
        for (const entry of this.watchEntries.values()) {
            this.startTarget(entry.target);
        }
    }

    private startTarget(target: SyncTargetDescriptor): void {
        if (!this.runtime || this.plans.length === 0) return;

        try {
            this.runtime.startSync(target);
        } catch (error) {
            logger.warn('SOCKET', '[AppSyncRuntime] Failed to start sync target', {
                error,
                data: { target },
            });
        }
    }

    private stopTarget(target: SyncTargetDescriptor): void {
        if (!this.runtime || this.plans.length === 0) return;

        try {
            this.runtime.stopSync(target);
        } catch (error) {
            logger.warn('SOCKET', '[AppSyncRuntime] Failed to stop sync target', {
                error,
                data: { target },
            });
        }
    }

    private detachRuntime(): void {
        const runtime = this.runtime;
        this.runtime = null;
        if (!runtime) return;

        try {
            runtime.stopAllSync();
            void runtime.stop();
        } catch (error) {
            logger.warn('SOCKET', '[AppSyncRuntime] Failed to detach sync runtime', { error });
        }
    }
}
