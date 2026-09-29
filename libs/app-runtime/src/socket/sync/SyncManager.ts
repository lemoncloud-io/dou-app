import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { RELAY_CLOUD_ID } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { getGlobalSessionContext, getUidInCloud, subscribeSessionSignal } from '../../session/store';
import { unrefTimer } from '../../utils/unrefTimer';
import type { ISocketManager, SlotKey } from '../types';
import { slotKeyOf } from '../utils/slotKey';
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

/**
 * One runtime per bound slot. The runtime owns the slot's connect-driven device.save and its
 * keepAlive/reconnect/rotation controllers, so it must live for the SLOT's lifetime — not only
 * while the slot is active. `plans` are built per runtime so two live schedulers (relay + cloud)
 * never share plan instances.
 */
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
    /**
     * Every registered target, keyed `${cid}|${type}:${id}`. The cloud is part of the key because ids
     * are only unique inside one cloud — two clouds both have a channel `1000001` — so two clouds'
     * targets of the same id are two targets, each with its own ref count and grace.
     */
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    /** Delayed-stop timers for grace-period (refs 0) entries. Cancelled by re-registration, slot rebind, or destroy. */
    private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeSession: () => void;
    /** The session uid remembered refusals belong to — compared on every session change. */
    private lastSessionUid: string | null;
    private readonly slotRuntimes = new Map<SlotKey, SlotRuntimeEntry>();
    /** Uid-mismatch warning fires once per instance — that's enough to know the cause, and logging it every poll would flood. */
    private warnedUidMismatch = false;

    constructor(
        private readonly manager: ISocketManager,
        deps: SyncManagerDeps = {}
    ) {
        this.buildPlans = deps.buildSyncPlans ?? createSyncPlans;
        this.runtimeOptions = deps.runtimeOptions ?? {};
        // createDeviceRuntime injects a DeviceSyncPlan and owns connect-driven device
        // save; app domain plans are passed as `extraSyncPlans` and tuning options
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
        // Every reader is called per use, never captured: the whole point is to notice a CHANGE.
        this.getUid = deps.getUid ?? getUidInCloud;
        this.getSessionUid = deps.getSessionUid ?? (() => getGlobalSessionContext().identity.userId ?? null);
        // Same normalisation as the cache scope (`deriveSelectedContext`): the cloud a target is
        // tagged with is the partition its plan writes into, so the two must name it identically.
        this.getCid =
            deps.getCid ??
            (() => {
                const cloudId = getGlobalSessionContext().cloud?.cloudId;
                return cloudId && cloudId !== RELAY_CLOUD_ID ? cloudId : RELAY_CLOUD_ID;
            });
        // Runtimes attach per SLOT (relay and cloud coexist): a backgrounded slot keeps its
        // device.save-on-connect + keepAlive/reconnect/rotation alive, so a relay reconnect while a
        // cloud is active still re-registers the device (device.save:ok also re-opens the auth gate
        // in bootstrapSocketConnection). An active-only runtime left the relay connection
        // device-less, breaking relay-pinned writes (device.update-remote → 400 no device linked).
        //
        // Targets ride the same notification: each one runs on the slot of its own cloud, so the
        // active slot moving is not an event this class needs at all.
        this.unsubscribeSlots = this.manager.subscribeSlotClients((slot, client) => {
            this.handleSlotClientChanged(slot, client);
        });

        // An account change must RETIRE the previous account's targets, not merely refuse to start
        // them again. The guest→social promotion re-authenticates the SAME socket, so no client swap
        // happens and nothing here is otherwise notified: the already-running targets keep polling
        // ids built from the guest's uid, and the server answers each one with
        // `403 not allowed to read join`. Waiting for the registering hook to unmount is not enough
        // either — `unregister` holds a 30s grace, which at the join plan's 10s cadence is three
        // more refusals per promotion.
        this.lastSessionUid = this.getSessionUid();
        const subscribe = deps.subscribeSession ?? subscribeSessionSignal;
        this.unsubscribeSession = subscribe(() => this.handleSessionChanged());
    }

    /** Drops every target whose cloud no longer knows this account by the uid it was registered under. */
    private handleSessionChanged(): void {
        const sessionUid = this.getSessionUid();
        if (sessionUid !== this.lastSessionUid) {
            this.lastSessionUid = sessionUid;
            // A refusal is a fact about what the server told ONE account in ONE cloud, and it is
            // keyed by channel id alone, so it means nothing once either changes — and the session
            // uid changes with both. Cleared here rather than per target: the entries below are only
            // the targets still registered, and a refusal outlives its registration on purpose (the
            // screen that asked for it has usually left by the time it is read).
            clearRefusedChannels();
        }

        // Read once per cloud for this pass: a home screen holds hundreds of entries across a few clouds.
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
            // Stopped immediately, grace bypassed on purpose: the grace exists to survive a screen
            // transition re-registering the SAME target, and an account change is the one case where
            // that can never happen — the new session's ids are different ones.
            this.stopTarget(entry);
        }
    }

    public register(target: SyncTargetDescriptor, options?: SyncRegisterOptions): () => void {
        const cid = options?.cid ?? this.getCid();
        // Resolved before anything is recorded: a word that is not a cloud id throws here, instead of
        // leaving behind an entry no slot will ever run.
        slotKeyOf(cid);
        const key = this.registryKey(cid, target);
        // Re-registering a key that was in its grace period: cancel the delayed stop and join the
        // still-live target — both the target and its snapshot are untouched, so there's neither an
        // immediate poll nor an unconditional write caused by a lost snapshot.
        this.cancelGraceStop(key);
        // A caller that names its cloud built the target for that cloud, so it is judged by the uid
        // this account has there. A caller that names none built it from the session — the ids of an
        // app's `join` targets embed the session uid — so it is tagged with the session uid. The two
        // agree whenever the selected cloud is the committed one; in a switch window they do not, and
        // then the session tag is what retires the target at the commit, before its stale id can be
        // polled on the incoming cloud's slot.
        const uid = options?.cid ? this.getUid(cid) : this.getSessionUid();
        const entry = this.watchEntries.get(key);
        // Merging is only correct when the account matches. A key can outlive an account change —
        // `channel:1000001` is the same string for whoever is logged in — so merging blindly would
        // hand the new session an entry still tagged with the previous uid, which is how a target
        // keeps polling after the account under it moved. An account change is a different target.
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
            // Starts now when the cloud's slot is bound; otherwise it waits, and starts when the slot
            // binds (handleSlotClientChanged).
            this.startTarget(owned);
        }

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            // The entry this registration joined may have been retired and the key taken by a new
            // one since; releasing a ref on that one would stop another caller's target early.
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

        // Don't stop immediately — hold a grace period (UNREGISTER_GRACE_MS) that a screen
        // transition's re-registration can cancel.
        this.scheduleGraceStop(key);
    }

    private scheduleGraceStop(key: string): void {
        this.cancelGraceStop(key);
        const timer = setTimeout(() => {
            this.graceTimers.delete(key);
            const entry = this.watchEntries.get(key);
            // If it was re-registered in the meantime (refs recovered), do nothing — cancellation is
            // the normal path, but this guard also closes the race between the timer and a re-register.
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
            // Its targets go down with it; their registry entries stay, and start again on the
            // runtime of this cloud's next slot.
            this.slotRuntimes.delete(slot);
            this.detachRuntime(existing.runtime);
        }
        if (!client) return;

        const plans = this.buildPlans(slot);
        const runtime = this.createRuntime(client, plans);
        this.slotRuntimes.set(slot, { client, runtime, plans });
        // start() activates the runtime's connect-driven device save (the device runtime gates it
        // behind an `active` flag) and this slot's controllers. The onState listener is registered
        // in the runtime constructor, so the `connected` event is caught even though connect()
        // happens after this.
        void runtime.start();
        this.startSlotTargets(slot);
    }

    /**
     * Starts this cloud's registered targets on the runtime its slot just got.
     *
     * Grace-period (refs 0) entries are dropped rather than started. Starting one would restart
     * polling for a screen that has already left, on a socket it never ran on; and leaving one in
     * place is worse — a re-registration would take `register`'s merge path, which does not start,
     * so that target would never run on the new runtime. Dropped, the re-registration creates it
     * afresh and starts it.
     */
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

    /**
     * True when the target still belongs to the account live in its cloud now.
     *
     * `null` (registered with no uid in that cloud) is NOT treated as "matches anything". An untagged
     * account is not a wildcard: the ids those targets carry were built from whatever the store held
     * at the time, and replaying them onto a real session is precisely the 403.
     */
    private isUidActive(entry: SyncWatchEntry): boolean {
        return entry.uid !== null && entry.uid === this.getUid(entry.cid);
    }

    /** The runtime of the slot serving `cid`, or null while that slot is not bound. */
    private runtimeFor(cid: string): SlotRuntimeEntry | null {
        return this.slotRuntimes.get(slotKeyOf(cid)) ?? null;
    }

    private startTarget(entry: SyncWatchEntry): void {
        const slot = this.runtimeFor(entry.cid);
        if (!slot || slot.plans.length === 0) return;
        if (!this.isUidActive(entry)) {
            // Once per manager: a stale target is retagged or dropped on its next register, so the
            // steady state is quiet — but a target that NEVER starts (a uid that stays null while
            // the socket is verified) would otherwise be an invisible, total sync stop.
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

    // Domain-agnostic pass-through to the runtime's baseline bridge. Chat prime (cold fetch +
    // baseline align) is owned by the `useChatSync` hook, not here — SyncManager stays domain
    // unaware. A no-op until the cloud's slot is bound, so callers (hooks) don't have to gate on it.
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
