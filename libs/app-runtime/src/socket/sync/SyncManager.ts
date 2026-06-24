import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import { getRepositories } from '../../data/runtime';
import type { ISocketManager } from '../types';
import { createSyncPlans } from './plans';
import type { ISyncManager, SyncManagerDeps, SyncRuntimeOptions, SyncWatchEntry } from './types';

const defaultBuildTargetKey = (target: SyncTargetDescriptor): string => `${target.type}:${target.id ?? ''}`;

export class SyncManager implements ISyncManager {
    private readonly plans: DomainSyncPlan[];
    private readonly runtimeOptions: SyncRuntimeOptions;
    private readonly createRuntime: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    private readonly buildTargetKey: (target: SyncTargetDescriptor) => string;
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    private readonly unsubscribeClient: () => void;
    private runtime: ClientSocketRuntime | null = null;

    constructor(
        private readonly manager: ISocketManager,
        deps: SyncManagerDeps = {}
    ) {
        this.plans = (deps.buildSyncPlans ?? createSyncPlans)();
        this.runtimeOptions = deps.runtimeOptions ?? {};
        // createDeviceRuntime injects a DeviceSyncPlan and owns connect-driven device
        // save; app domain plans are passed as extraSyncPlans and tuning options
        // (keepAlive/reconnect/rotation/devicePlan) are forwarded verbatim.
        this.createRuntime =
            deps.createRuntime ??
            ((client, plans) =>
                createDeviceRuntime({
                    client,
                    extraSyncPlans: plans,
                    ...this.runtimeOptions,
                }));
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

    public registerChat(id: string, intervalMs?: number): () => void {
        return this.register({
            type: 'chat',
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

    public registerJoin(id: string, intervalMs?: number): () => void {
        return this.register({
            type: 'join',
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
        // start() activates the runtime's connect-driven device save (the device
        // runtime gates it behind an `active` flag) and the rotation controller.
        // The onState listener is registered in the runtime constructor, so the
        // `connected` event is caught even though connect() happens after this.
        void this.runtime.start();
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
            logger.warn('SOCKET', '[SyncManager] Failed to start sync target', {
                error,
                data: { target },
            });
        }

        this.primeChatTarget(target);
    }

    // Chat plans have a no-op `run`, so a mid-session register loads nothing. We align the
    // plan baseline to what the (durable) chat cache already holds — its max chatNo is the
    // cursor — via `updateLocalSnapshot`, then only fetch a first page when the cache is empty.
    // Deeper gaps are caught up by ChatSyncPlan.onConnected on the next (re)connect.
    private primeChatTarget(target: SyncTargetDescriptor): void {
        if (target.type !== 'chat' || !target.id) return;
        const runtime = this.runtime;
        if (!runtime) return;
        const channelId = target.id;

        void (async () => {
            const repos = getRepositories();
            const cached = await repos.chat.cacheReadList({ channelId });
            const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);

            runtime.updateLocalSnapshot(
                { type: 'chat', id: channelId },
                { id: channelId, lastNo, minNo: 0, messages: [] }
            );

            if (lastNo === 0) {
                await repos.chat.refreshList({ channelId });
            }
        })().catch(error => {
            logger.warn('SOCKET', '[SyncManager] Failed to prime chat target', {
                error,
                data: { channelId },
            });
        });
    }

    private stopTarget(target: SyncTargetDescriptor): void {
        if (!this.runtime || this.plans.length === 0) return;

        try {
            this.runtime.stopSync(target);
        } catch (error) {
            logger.warn('SOCKET', '[SyncManager] Failed to stop sync target', {
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
            logger.warn('SOCKET', '[SyncManager] Failed to detach sync runtime', { error });
        }
    }
}
