import type {
    ClientSocketRuntime,
    ClientSocketV2,
    DomainSyncPlan,
    SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

import { logger } from '@chatic/bridges';
import type { ISocketManager, SocketKind } from '../types';
import { createSyncPlans } from './plans';
import type { ISyncManager, SyncManagerDeps, SyncRuntimeOptions, SyncWatchEntry } from './types';
import { isCidActive as isCidActiveGuard } from '@chatic/data';

const defaultBuildTargetKey = (target: SyncTargetDescriptor): string => `${target.type}:${target.id ?? ''}`;

/**
 * refs가 0이 된 타깃을 실제로 stop하기까지의 유예 (ADR-0058).
 *
 * 화면 전환은 이전 화면의 unregister와 다음 화면의 register를 몇 ms 간격으로 반복하는데, 즉시
 * stop하면 scheduler가 타깃과 **스냅샷을 함께 폐기**해 재등록마다 즉시 폴링 1회(`scheduleNow(0)`)
 * + 스냅샷 부재로 인한 "무조건 변경" 캐시 쓰기 1회가 났다 — 2026-08-14 폭주 감사에서 잡힌
 * `save:channel` 228 / `save:join` 632의 정체다. 유예 내 재등록은 `register`의 기존 merge 경로로
 * 살아 있는 타깃에 그대로 합류하므로 재시작도 재폴링도 없다.
 *
 * 30초: 방↔홈 왕복(보통 수 초)을 넉넉히 덮되, 떠난 채널의 폴링이 백그라운드에 오래 살아남지
 * 않는 값. 유예 중인 타깃의 폴링은 idle 백오프(최대 60초)를 이어가므로 잔여 비용은 채널당
 * 많아야 요청 한두 건이다.
 */
export const UNREGISTER_GRACE_MS = 30_000;

/** Node에서만 존재하는 unref로 유예 타이머가 프로세스 종료를 붙잡지 않게 한다(브라우저는 no-op). */
const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};

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
    private readonly watchEntries = new Map<string, SyncWatchEntry>();
    /** 유예 중(refs 0) 엔트리의 지연 stop 타이머. 재등록·클라이언트 교체·destroy가 취소한다. */
    private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly unsubscribeSlots: () => void;
    private readonly unsubscribeClient: () => void;
    private readonly slotRuntimes = new Map<SocketKind, SlotRuntimeEntry>();
    private activeClient: ClientSocketV2 | null = null;

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
    }

    public register(target: SyncTargetDescriptor): () => void {
        const key = this.buildTargetKey(target);
        // 유예 중이던 키의 재등록: 지연 stop을 취소하고 살아 있는 타깃에 합류한다 — 타깃도
        // 스냅샷도 그대로이므로 즉시 폴링도, 스냅샷 소실로 인한 무조건 쓰기도 없다.
        this.cancelGraceStop(key);
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
        this.unsubscribeSlots();
        this.unsubscribeClient();
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
        return isCidActiveGuard(cid, this.manager.getBoundCid());
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

    private startTarget(target: SyncTargetDescriptor, cid: string | null): void {
        const entry = this.getActiveEntry();
        if (!entry || entry.plans.length === 0) return;
        if (!this.isCidActive(cid)) return;

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
