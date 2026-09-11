import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import { getGlobalSessionContext, subscribeSessionSignal } from '../../session/store';
import { unrefTimer } from '../../utils/unrefTimer';
import type { ISocketManager, SocketKind } from '../types';
import { UNREGISTER_GRACE_MS } from './constants';
import { createSyncPlans } from './plans';
import type { ISyncManager, SyncManagerDeps, SyncRuntimeOptions, SyncWatchEntry } from './types';
import { isCidActive as isCidActiveGuard } from '@chatic/data';

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
    private readonly buildPlans: () => DomainSyncPlan[];
    private readonly runtimeOptions: SyncRuntimeOptions;
    private readonly createRuntime: (client: ClientSocketV2, plans: DomainSyncPlan[]) => ClientSocketRuntime;
    private readonly buildTargetKey: (target: SyncTargetDescriptor) => string;
    private readonly getUid: () => string | null;
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    /** 유예 중(refs 0) 엔트리의 지연 stop 타이머. 재등록·클라이언트 교체·destroy가 취소한다. */
    private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeClient: () => void;
    private readonly unsubscribeSession: () => void;
    /** The account the live targets belong to — compared on every session change. */
    private lastUid: string | null;
    private readonly slotRuntimes = new Map<SocketKind, SlotRuntimeEntry>();
    private activeClient: ClientSocketV2 | null = null;
    /** uid 불일치 경고는 인스턴스당 1회 — 원인을 아는 데 그거면 충분하고, 폴링마다 찍으면 폭주한다. */
    private warnedUidMismatch = false;

    constructor(
        private readonly manager: ISocketManager,
        deps: SyncManagerDeps = {}
    ) {
        // Plans read the bound cloud through the manager THIS instance owns, so `plans` never
        // imports `socket/runtime` (that import closed a cycle back through this file).
        this.buildPlans = deps.buildSyncPlans ?? (() => createSyncPlans(() => this.manager.getBoundCid()));
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
        // The uid is read per call, never captured: the whole point is to notice when it CHANGES.
        this.getUid = deps.getUid ?? (() => getGlobalSessionContext().identity.userId ?? null);
        // Runtimes attach per SLOT (relay and cloud coexist): a backgrounded slot keeps its
        // device.save-on-connect + keepAlive/reconnect/rotation alive, so a relay reconnect while a
        // cloud is active still re-registers the device (device.save:ok also re-opens the auth gate
        // in bootstrapSocketConnection). The active-only runtime this replaces left the relay
        // connection device-less, breaking relay-pinned writes (device.update-remote → 400 no
        // device linked).
        this.unsubscribeSlots = this.manager.subscribeSlotClients((kind, client) => {
            this.handleSlotClientChanged(kind, client);
        });
        // Sync TARGETS still follow the ACTIVE slot only. The manager notifies slot changes before
        // active changes, so the runtime a replay lands on always exists.
        this.unsubscribeClient = this.manager.subscribeClient(client => {
            this.handleActiveClientChanged(client);
        });

        // An account change must RETIRE the previous account's targets, not merely refuse to start
        // them again. The guest→social promotion re-authenticates the SAME socket, so no client swap
        // happens and nothing here is otherwise notified: the already-running targets keep polling
        // ids built from the guest's uid, and the server answers each one with
        // `403 not allowed to read join`. Waiting for the registering hook to unmount is not enough
        // either — `unregister` holds a 30s grace, which at the join plan's 10s cadence is three
        // more refusals per promotion.
        this.lastUid = this.getUid();
        const subscribe = deps.subscribeSession ?? subscribeSessionSignal;
        this.unsubscribeSession = subscribe(() => this.handleSessionChanged());
    }

    /** Drops every target that belongs to an account other than the one live now. */
    private handleSessionChanged(): void {
        const uid = this.getUid();
        if (uid === this.lastUid) return;
        this.lastUid = uid;

        for (const [key, entry] of [...this.watchEntries.entries()]) {
            if (entry.uid === uid) continue;
            logger.info('SOCKET', '[SyncManager] account changed — retiring the previous session target', {
                data: { key, from: entry.uid, to: uid },
            });
            this.cancelGraceStop(key);
            this.watchEntries.delete(key);
            // Stopped immediately, grace bypassed on purpose: the grace exists to survive a screen
            // transition re-registering the SAME target, and an account change is the one case where
            // that can never happen — the new session's ids are different ones.
            this.stopTarget(entry.target);
        }
    }

    public register(target: SyncTargetDescriptor): () => void {
        const key = this.buildTargetKey(target);
        // 유예 중이던 키의 재등록: 지연 stop을 취소하고 살아 있는 타깃에 합류한다 — 타깃도
        // 스냅샷도 그대로이므로 즉시 폴링도, 스냅샷 소실로 인한 무조건 쓰기도 없다.
        this.cancelGraceStop(key);
        const cid = this.manager.getBoundCid();
        const uid = this.getUid();
        const entry = this.watchEntries.get(key);
        // Merging is only correct when the SCOPE matches. A key can outlive an account change —
        // `channel:1000001` is the same string for whoever is logged in — so merging blindly would
        // hand the new session an entry still tagged with the previous uid, which is how a target
        // keeps polling after the account under it moved. A scope change is a different target.
        if (entry && (entry.cid !== cid || entry.uid !== uid)) {
            logger.info('SOCKET', '[SyncManager] target re-registered under a new scope — retagging', {
                data: { key, from: { cid: entry.cid, uid: entry.uid }, to: { cid, uid } },
            });
            this.stopTarget(entry.target);
            this.watchEntries.delete(key);
        }
        const live = this.watchEntries.get(key);
        if (live) {
            live.refs += 1;
            live.target = { ...live.target, ...target };
        } else {
            // Tag the target with the cloud AND the account it is registered under, so a later
            // client swap or account change only replays it onto a matching session (§8-a trap #2).
            this.watchEntries.set(key, {
                target: { ...target },
                refs: 1,
                cid,
                uid,
            });
            this.startTarget(target, cid, uid);
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
        this.unsubscribeSlots();
        this.unsubscribeClient();
        this.unsubscribeSession();
        for (const timer of this.graceTimers.values()) clearTimeout(timer);
        this.graceTimers.clear();
        for (const [kind, entry] of this.slotRuntimes) {
            this.slotRuntimes.delete(kind);
            this.detachRuntime(entry.runtime);
        }
        this.activeClient = null;
        this.watchEntries.clear();
    }

    private unregister(key: string): void {
        const entry = this.watchEntries.get(key);
        if (!entry) return;

        entry.refs -= 1;
        if (entry.refs > 0) return;

        // 즉시 stop하지 않고 유예를 건다(UNREGISTER_GRACE_MS) — 화면 전환의 재등록이 취소한다.
        this.scheduleGraceStop(key);
    }

    private scheduleGraceStop(key: string): void {
        this.cancelGraceStop(key);
        const timer = setTimeout(() => {
            this.graceTimers.delete(key);
            const entry = this.watchEntries.get(key);
            // 그 사이 재등록됐으면(refs 회복) 아무것도 하지 않는다 — 취소가 정상 경로지만,
            // 타이머와 재등록의 레이스까지 이 가드가 닫는다.
            if (!entry || entry.refs > 0) return;
            this.watchEntries.delete(key);
            this.stopTarget(entry.target);
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

    /**
     * 유예 중(refs 0) 엔트리를 정리한다 — 활성 클라이언트 교체 시 호출.
     *
     * 이월하면 두 가지가 깨진다: 유예 엔트리가 남아 있으면 새 클라이언트에서의 재등록이
     * `register`의 merge 경로로 빠져 `startSync`를 건너뛰므로 그 타깃이 **영영 시작되지 않고**,
     * 반대로 replay가 refs 0 엔트리를 시작하면 떠난 화면의 타깃이 새 소켓에서 폴링을 다시
     * 시작한다. 이전 runtime의 타깃은 호출부의 `stopAllSync`가 이미 내렸으므로 여기서는
     * 엔트리와 타이머만 지운다.
     */
    private purgeGraceEntries(): void {
        for (const [key, entry] of [...this.watchEntries.entries()]) {
            if (entry.refs > 0) continue;
            this.cancelGraceStop(key);
            this.watchEntries.delete(key);
        }
    }

    private handleSlotClientChanged(kind: SocketKind, client: ClientSocketV2 | null): void {
        const existing = this.slotRuntimes.get(kind);
        if (existing?.client === client) return;
        if (existing) {
            this.slotRuntimes.delete(kind);
            this.detachRuntime(existing.runtime);
        }
        if (!client) return;

        const plans = this.buildPlans();
        const runtime = this.createRuntime(client, plans);
        this.slotRuntimes.set(kind, { client, runtime, plans });
        // start() activates the runtime's connect-driven device save (the device runtime gates it
        // behind an `active` flag) and this slot's controllers. The onState listener is registered
        // in the runtime constructor, so the `connected` event is caught even though connect()
        // happens after this. Targets are NOT replayed here: on an active-slot mutation the
        // manager's active-client notification follows and replays them exactly once.
        void runtime.start();
    }

    private handleActiveClientChanged(client: ClientSocketV2 | null): void {
        if (this.activeClient === client) return;

        // Move sync targets off the outgoing active runtime — but keep the runtime running: its
        // slot may merely be backgrounded (relay under a new cloud), and it must keep owning the
        // slot's device save + keepAlive. A torn-down slot is detached via the slot notification.
        const previous = this.findRuntimeByClient(this.activeClient);
        if (previous) {
            try {
                previous.stopAllSync();
            } catch (error) {
                logger.warn('SOCKET', '[SyncManager] Failed to stop targets on the outgoing runtime', { error });
            }
        }

        // 유예 중 엔트리는 새 활성 클라이언트로 넘기지 않는다 — purgeGraceEntries 참조.
        this.purgeGraceEntries();
        this.activeClient = client;
        this.replayTargets();
    }

    private replayTargets(): void {
        for (const entry of this.watchEntries.values()) {
            this.startTarget(entry.target, entry.cid, entry.uid);
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
        return isCidActiveGuard(cid, this.manager.getBoundCid());
    }

    /**
     * True when the target still belongs to the session that is live now.
     *
     * `null` (registered with no session) is NOT treated as "matches anything" — unlike the cid
     * rule above, which is deliberately permissive for a target registered before any socket bound.
     * An untagged account is not a wildcard: the ids those targets carry were built from whatever
     * the store held at the time, and replaying them onto a real session is precisely the 403.
     */
    private isUidActive(uid: string | null): boolean {
        return uid !== null && uid === this.getUid();
    }

    private getActiveEntry(): SlotRuntimeEntry | null {
        return this.findEntryByClient(this.activeClient);
    }

    private findEntryByClient(client: ClientSocketV2 | null): SlotRuntimeEntry | null {
        if (!client) return null;
        for (const entry of this.slotRuntimes.values()) {
            if (entry.client === client) return entry;
        }
        return null;
    }

    private findRuntimeByClient(client: ClientSocketV2 | null): ClientSocketRuntime | null {
        return this.findEntryByClient(client)?.runtime ?? null;
    }

    private startTarget(target: SyncTargetDescriptor, cid: string | null, uid: string | null): void {
        const entry = this.getActiveEntry();
        if (!entry || entry.plans.length === 0) return;
        if (!this.isCidActive(cid)) return;
        if (!this.isUidActive(uid)) {
            // Once per manager: a stale target is retagged or dropped on its next register, so the
            // steady state is quiet — but a target that NEVER starts (a uid that stays null while
            // the socket is verified) would otherwise be an invisible, total sync stop.
            if (!this.warnedUidMismatch) {
                this.warnedUidMismatch = true;
                logger.warn('SOCKET', '[SyncManager] target belongs to another session — not started', {
                    data: { target, uid, currentUid: this.getUid() },
                });
            }
            return;
        }

        try {
            entry.runtime.startSync(target);
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
        this.getActiveEntry()?.runtime.updateLocalSnapshot(...args);
    }

    private stopTarget(target: SyncTargetDescriptor): void {
        const entry = this.getActiveEntry();
        if (!entry || entry.plans.length === 0) return;

        try {
            entry.runtime.stopSync(target);
        } catch (error) {
            logger.warn('SOCKET', '[SyncManager] Failed to stop sync target', {
                error,
                data: { target },
            });
        }
    }

    private detachRuntime(runtime: ClientSocketRuntime): void {
        try {
            runtime.stopAllSync();
            void runtime.stop();
        } catch (error) {
            logger.warn('SOCKET', '[SyncManager] Failed to detach sync runtime', { error });
        }
    }
}
