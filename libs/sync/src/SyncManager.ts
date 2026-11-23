import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { RELAY_CLOUD_ID } from '@chatic/data';
import { logger } from '@chatic/logger';
import { getGlobalSessionContext, getUidInCloud, subscribeSessionSignal } from '@chatic/session';
import { unrefTimer } from './unrefTimer';
import { slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SlotKey } from '@chatic/transport';
import { UNREGISTER_GRACE_MS } from './constants';
import { createSyncPlans } from './plans';
import { clearRefusedChannels } from './refusedChannels';
import type {
    ISyncManager,
    SyncManagerDeps,
    SyncRegisterOptions,
    SyncRuntimeOptions,
    SyncTargetListing,
    SyncWatchEntry,
} from './types';

const defaultBuildTargetKey = (target: SyncTargetDescriptor): string => `${target.type}:${target.id ?? ''}`;

interface SlotRuntimeEntry {
    client: ClientSocketV2;
    runtime: ClientSocketRuntime;
    plans: DomainSyncPlan[];
}

export class SyncManager implements ISyncManager {
    private readonly buildPlans: (slot: SlotKey) => DomainSyncPlan[];
    private readonly runtimeOptions: SyncRuntimeOptions;
    private readonly createRuntime: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    private readonly buildTargetKey: (target: SyncTargetDescriptor) => string;
    private readonly getUid: (cid: string) => string | null;
    private readonly getSessionUid: () => string | null;
    private readonly getCid: () => string;
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeSession: () => void;
    private lastSessionUid: string | null;
    private readonly slotRuntimes = new Map<SlotKey, SlotRuntimeEntry>();
    private warnedUidMismatch = false;

    constructor(
        private readonly manager: ISocketManager,
        deps: SyncManagerDeps = {}
    ) {
        this.buildPlans = deps.buildSyncPlans ?? createSyncPlans;
        this.runtimeOptions = deps.runtimeOptions ?? {};
        this.createRuntime =
            deps.createRuntime ??
            ((client, plans) =>
                createDeviceRuntime({
                    client,
                    extraSyncPlans: plans,
                    ...this.runtimeOptions,
                }));
        this.buildTargetKey = deps.buildTargetKey ?? defaultBuildTargetKey;
        this.getUid = deps.getUid ?? getUidInCloud;
        this.getSessionUid = deps.getSessionUid ?? (() => getGlobalSessionContext().identity.userId ?? null);
        this.getCid =
            deps.getCid ??
            (() => {
                const cloudId = getGlobalSessionContext().cloud?.cloudId;
                return cloudId && cloudId !== RELAY_CLOUD_ID ? cloudId : RELAY_CLOUD_ID;
            });
        this.unsubscribeSlots = this.manager.subscribeSlotClients((slot, client) => {
            this.handleSlotClientChanged(slot, client);
        });

        this.lastSessionUid = this.getSessionUid();
        const subscribe = deps.subscribeSession ?? subscribeSessionSignal;
        this.unsubscribeSession = subscribe(() => this.handleSessionChanged());
    }

    private handleSessionChanged(): void {
        const sessionUid = this.getSessionUid();
        if (sessionUid !== this.lastSessionUid) {
            this.lastSessionUid = sessionUid;
            clearRefusedChannels();
        }

        const uidByCloud = new Map<string, string | null>();
        const uidOf = (cid: string): string | null => {
            if (!uidByCloud.has(cid)) uidByCloud.set(cid, this.getUid(cid));
            return uidByCloud.get(cid) ?? null;
        };
        for (const [key, entry] of [...this.watchEntries.entries()]) {
            const uid = uidOf(entry.cid);
            if (entry.uid === uid) continue;
            logger.info('SYNC', '[SyncManager] account changed — retiring the previous session target', {
                data: { key, cid: entry.cid, from: entry.uid, to: uid },
            });
            this.cancelGraceStop(key);
            this.watchEntries.delete(key);
            this.stopTarget(entry);
        }
    }

    public register(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void {
        const cid = options?.cid ?? this.getCid();
        slotKeyOf(cid);
        const key = this.registryKey(cid, target);
        this.cancelGraceStop(key);
        const uid = options?.cid ? this.getUid(cid) : this.getSessionUid();
        const entry = this.watchEntries.get(key);
        if (entry && entry.uid !== uid) {
            logger.info('SYNC', '[SyncManager] target re-registered under a new account — retagging', {
                data: { key, from: entry.uid, to: uid },
            });
            this.stopTarget(entry);
            this.watchEntries.delete(key);
        }
        let owned = this.watchEntries.get(key);
        if (owned) {
            owned.refs += 1;
            owned.target = { ...owned.target, ...target };
        } else {
            owned = { target: { ...target }, refs: 1, cid, uid };
            this.watchEntries.set(key, owned);
            this.startTarget(owned);
        }

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            if (this.watchEntries.get(key) !== owned) return;
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

    public registerChannel(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void {
        return this.register(
            {
                type: 'channel',
                id,
                ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
            },
            options
        );
    }

    public registerChat(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void {
        return this.register(
            {
                type: 'chat',
                id,
                ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
            },
            options
        );
    }

    public registerPlace(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void {
        return this.register(
            {
                type: 'place',
                id,
                ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
            },
            options
        );
    }

    public registerProfile(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void {
        return this.register(
            {
                type: 'profile',
                id,
                ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
            },
            options
        );
    }

    public registerJoin(id: string, intervalMs?: number, options?: SyncRegisterOptions): () => void {
        return this.register(
            {
                type: 'join',
                id,
                ...(typeof intervalMs === 'number' ? { intervalMs } : {}),
            },
            options
        );
    }

    public listTargets(): SyncTargetListing[] {
        return [...this.watchEntries.values()].map(entry => ({ ...entry.target, cid: entry.cid }));
    }

    public destroy(): void {
        clearRefusedChannels();
        this.unsubscribeSlots();
        this.unsubscribeSession();
        for (const timer of this.graceTimers.values()) clearTimeout(timer);
        this.graceTimers.clear();
        for (const [slot, entry] of this.slotRuntimes) {
            this.slotRuntimes.delete(slot);
            this.detachRuntime(entry.runtime);
        }
        this.watchEntries.clear();
    }

    private registryKey(cid: string, target: SyncTargetDescriptor): string {
        return `${cid}|${this.buildTargetKey(target)}`;
    }

    private unregister(key: string): void {
        const entry = this.watchEntries.get(key);
        if (!entry) return;

        entry.refs -= 1;
        if (entry.refs > 0) return;

        this.scheduleGraceStop(key);
    }

    private scheduleGraceStop(key: string): void {
        this.cancelGraceStop(key);
        const timer = setTimeout(() => {
            this.graceTimers.delete(key);
            const entry = this.watchEntries.get(key);
            if (!entry || entry.refs > 0) return;
            this.watchEntries.delete(key);
            this.stopTarget(entry);
        }, UNREGISTER_GRACE_MS);
        unrefTimer(timer);
        this.graceTimers.set(key, timer);
    }

    private cancelGraceStop(key: string): void {
        const timer = this.graceTimers.get(key);
        if (timer === undefined) return;
        clearTimeout(timer);
        this.graceTimers.delete(key);
    }

    private handleSlotClientChanged(slot: SlotKey, client: ClientSocketV2 | null): void {
        const existing = this.slotRuntimes.get(slot);
        if (existing?.client === client) return;
        if (existing) {
            this.slotRuntimes.delete(slot);
            this.detachRuntime(existing.runtime);
        }
        if (!client) return;

        const plans = this.buildPlans(slot);
        const runtime = this.createRuntime(client, plans);
        this.slotRuntimes.set(slot, { client, runtime, plans });
        void runtime.start();
        this.startSlotTargets(slot);
    }

    private startSlotTargets(slot: SlotKey): void {
        for (const [key, entry] of [...this.watchEntries.entries()]) {
            if (slotKeyOf(entry.cid) !== slot) continue;
            if (entry.refs > 0) {
                this.startTarget(entry);
                continue;
            }
            this.cancelGraceStop(key);
            this.watchEntries.delete(key);
        }
    }

    private isUidActive(entry: SyncWatchEntry): boolean {
        return entry.uid !== null && entry.uid === this.getUid(entry.cid);
    }

    private runtimeFor(cid: string): SlotRuntimeEntry | null {
        return this.slotRuntimes.get(slotKeyOf(cid)) ?? null;
    }

    private startTarget(entry: SyncWatchEntry): void {
        const slot = this.runtimeFor(entry.cid);
        if (!slot || slot.plans.length === 0) return;
        if (!this.isUidActive(entry)) {
            if (!this.warnedUidMismatch) {
                this.warnedUidMismatch = true;
                logger.warn('SYNC', '[SyncManager] target belongs to another session — not started', {
                    data: { target: entry.target, cid: entry.cid, uid: entry.uid, currentUid: this.getUid(entry.cid) },
                });
            }
            return;
        }

        try {
            slot.runtime.startSync(entry.target);
        } catch (error) {
            logger.warn('SYNC', '[SyncManager] Failed to start sync target', {
                error,
                data: { target: entry.target, cid: entry.cid },
            });
        }
    }

    public updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown, options?: SyncRegisterOptions): void {
        this.runtimeFor(options?.cid ?? this.getCid())?.runtime.updateLocalSnapshot(target, snapshot);
    }

    private stopTarget(entry: SyncWatchEntry): void {
        const slot = this.runtimeFor(entry.cid);
        if (!slot || slot.plans.length === 0) return;

        try {
            slot.runtime.stopSync(entry.target);
        } catch (error) {
            logger.warn('SYNC', '[SyncManager] Failed to stop sync target', {
                error,
                data: { target: entry.target, cid: entry.cid },
            });
        }
    }

    private detachRuntime(runtime: ClientSocketRuntime): void {
        try {
            runtime.stopAllSync();
            void runtime.stop();
        } catch (error) {
            logger.warn('SYNC', '[SyncManager] Failed to detach sync runtime', { error });
        }
    }
}
