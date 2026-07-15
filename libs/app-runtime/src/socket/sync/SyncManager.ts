import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
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
            // Tag the target with the cloud it is registered under (the active slot's boundCid) so a
            // later client swap only replays it onto the matching client (§8-a trap #2).
            const cid = this.manager.getBoundCid();
            this.watchEntries.set(key, {
                target: { ...target },
                refs: 1,
                cid,
            });
            this.startTarget(target, cid);
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
            this.startTarget(entry.target, entry.cid);
        }
    }

    /**
     * A target syncs only on the client whose `boundCid` it was registered under. `cid == null`
     * (registered before any socket bound) is cid-agnostic and always eligible. This keeps a cloud's
     * channel/chat targets off the relay socket after a cloud logout, and off a different cloud's
     * socket after a switch — the frame-level `dropForeignFrame` guard (plans.ts) only covers the
     * mid-switch same-url window, not a target replayed onto a genuinely different active client.
     */
    private isCidActive(cid: string | null): boolean {
        return cid == null || cid === this.manager.getBoundCid();
    }

    private startTarget(target: SyncTargetDescriptor, cid: string | null): void {
        if (!this.runtime || this.plans.length === 0) return;
        if (!this.isCidActive(cid)) return;

        try {
            this.runtime.startSync(target);
        } catch (error) {
            logger.warn('SOCKET', '[SyncManager] Failed to start sync target', {
                error,
                data: { target },
            });
        }
    }

    // Domain-agnostic pass-through to the runtime's baseline bridge. Chat prime (cold fetch +
    // baseline align) is owned by the `useChatSync` hook, not here — SyncManager stays domain
    // unaware. A no-op until a runtime exists, so callers (hooks) don't have to gate on it.
    public updateLocalSnapshot(...args: Parameters<ClientSocketRuntime['updateLocalSnapshot']>): void {
        this.runtime?.updateLocalSnapshot(...args);
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
