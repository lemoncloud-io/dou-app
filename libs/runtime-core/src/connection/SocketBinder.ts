import { logger } from '@chatic/logger';

import { hasLiveJoinedSession, RELAY_SLOT, kindOf, slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SlotKey, SocketBindingConfig } from '@chatic/transport';
import { bootstrapSocketConnection, notifySocketLogout } from '@chatic/auth';
import type { SocketSessionDelegate } from '@chatic/auth';
import type { RuntimeSocketSlots } from './types';
import { socketRebootKey } from './socketRebootKey';

/** One slot this binder has booted, and how to detach that boot's SDK subscriptions. */
interface BootedSlot {
    rebootKey: string;
    delegate: SocketSessionDelegate;
    /** Set once detached; a bootstrap that resolves afterwards detaches itself instead. */
    detached: boolean;
    cleanup: (() => void) | null;
}

/** The slots the session asks for, keyed by the cloud each serves, and the one to make active. */
interface DesiredSlots {
    configs: Map<SlotKey, SocketBindingConfig>;
    active: SlotKey | null;
}

const desiredSlotsOf = (slots: RuntimeSocketSlots): DesiredSlots => {
    const configs = new Map<SlotKey, SocketBindingConfig>();
    // Background first, the committed cloud last: should the two ever name the same cloud, the
    // committed config is the one that binds. The derivation excludes that case; this makes it moot.
    for (const slot of [slots.relay, ...(slots.background ?? []), slots.cloud]) {
        if (slot) configs.set(slotKeyOf(slot.config.cid), slot.config);
    }
    return { configs, active: slots.cloud ? slotKeyOf(slots.cloud.config.cid) : null };
};

/**
 * What a reconcile is keyed on: each desired slot's key and reboot key, and the slot to make active.
 * The slots object is fresh on every derivation, so comparing this string keeps a pass that changed
 * nothing from reconciling again.
 *
 * The active slot has to be in it on its own. A switch between two clouds that both hold a slot —
 * one committed, one in the background — leaves the set of slots and every reboot key exactly as they
 * were; only which of them is active moves. Keyed on the set alone, that switch never reconciled and
 * the facade stayed on the cloud the user had left.
 */
const slotsSignature = (slots: RuntimeSocketSlots): string => {
    const desired = desiredSlotsOf(slots);
    const bound = [...desired.configs]
        .map(([key, config]) => `${key}=${socketRebootKey(config)}`)
        .sort()
        .join(';');
    return `${bound}|active=${desired.active ?? ''}`;
};

const detach = (booted: BootedSlot): void => {
    booted.detached = true;
    booted.cleanup?.();
    booted.cleanup = null;
};

/**
 * Brings the manager's slots in line with `desired`, in an order that keeps the active facade on a
 * real socket throughout:
 *
 *   1. bind every slot that is new or whose reboot key moved;
 *   2. point the active facade at the desired slot;
 *   3. tear down every bound slot the session no longer asks for.
 *
 * On a switch between two clouds the account belongs to, both slots are already bound — the target
 * as a background slot — so the pass only moves the pointer: `active moved B`, nothing bound, nothing
 * torn down, and A stays up as a background slot. Only a cloud that was not kept in the background
 * reads `bound B → active moved B → torn down A`. Step 1 can finish before step 2 because
 * `bootstrapSocketConnection` calls `ensure` before its first `await`, so the slot exists by the
 * time the pointer moves; the active client goes from A straight to B either way, never via relay.
 *
 * Step 3 reads the MANAGER's slots, not only the ones this binder remembers booting. The remembered
 * set is cleared when the binder stops (see `detachAll`), so a restart that asks for fewer slots would
 * otherwise leave the missing ones bound with nothing left to tear them down.
 *
 * A cloud slot torn down while its session is still good — the cloud is still in the app's list, so
 * it was pushed past the cap rather than left — is told `auth.logout` first, while its client is
 * still alive. Every other teardown has nothing to sign off from (a cloud no longer joined, a session
 * already expired) or has been signed off already (a relay logout notifies every slot itself, and
 * with no relay slot desired none is notified here).
 */
const reconcileSlots = (
    manager: ISocketManager,
    booted: Map<SlotKey, BootedSlot>,
    desired: DesiredSlots,
    delegate: SocketSessionDelegate
): void => {
    for (const [key, config] of desired.configs) {
        const rebootKey = socketRebootKey(config);
        const current = booted.get(key);
        if (current && current.rebootKey === rebootKey && current.delegate === delegate) continue;

        // A reboot: detach the previous boot's subscriptions first. `ensure` inside bootstrap then
        // rebuilds the client, because the config it is handed differs from the bound one.
        if (current) detach(current);
        const next: BootedSlot = { rebootKey, delegate, detached: false, cleanup: null };
        booted.set(key, next);
        void bootstrapSocketConnection({ manager, config, delegate })
            .then(cleanup => {
                if (next.detached) {
                    cleanup();
                    return;
                }
                next.cleanup = cleanup;
            })
            .catch(error => {
                // Forget the failed boot so the next reconcile retries it; remembering it would skip
                // the slot for as long as its reboot key holds. `active` says whether the pointer is
                // now naming a slot that is not bound, i.e. the facade has quietly stayed on relay.
                if (!next.detached && booted.get(key) === next) booted.delete(key);
                logger.error('SOCKET', '[SocketBinder] bootstrap failed', {
                    error,
                    data: { cid: key, kind: kindOf(key), active: desired.active === key },
                });
            });
    }

    manager.setActiveSlot(desired.active);

    const relayKept = desired.configs.has(RELAY_SLOT);
    for (const key of manager.getSlotKeys()) {
        if (desired.configs.has(key) || !relayKept || kindOf(key) !== 'cloud') continue;
        if (hasLiveJoinedSession(key)) notifySocketLogout(key, manager);
    }

    for (const [key, current] of [...booted]) {
        if (desired.configs.has(key)) continue;
        detach(current);
        booted.delete(key);
    }
    for (const key of manager.getSlotKeys()) {
        if (!desired.configs.has(key)) manager.destroy(key);
    }
};

/**
 * Boots the sockets the session asks for — a relay slot (always-on once a relay token exists), a
 * cloud slot (present only while a cloud session is committed) and a background slot per other
 * cloud the account belongs to — and keeps the active facade pointed at the cloud slot when there
 * is one. One reconcile owns every slot, so the order across slots is decided in one place (see
 * `reconcileSlots`) instead of falling out of which of two independent passes happened to run first.
 *
 * A slot is identified by its key — the cloud it serves — plus its reboot key `url|deviceId|wssType`.
 * A different cloud is therefore always a different slot, whatever its URL, and a cloud moving
 * between background and committed is the SAME slot: its key and reboot key do not change, so the
 * client and its connection are reused. The identity token is not part of either, because a refresh
 * must not reboot a healthy socket.
 *
 * `detachAll` detaches every boot's SDK subscriptions and forgets them, but does not destroy the
 * sockets. That is what a stop followed by a start relies on — React StrictMode's mount → unmount →
 * mount of the host is one: the next binder re-bootstraps each slot, `ensure` finds the config
 * unchanged and reuses the client, and the first boot's late resolution detaches itself.
 */
export class SocketBinder {
    private readonly booted = new Map<SlotKey, BootedSlot>();
    /** The signature and delegate of the last reconcile; `null` until the first one. */
    private last: { signature: string; delegate: SocketSessionDelegate } | null = null;

    constructor(private readonly manager: ISocketManager) {}

    /**
     * Reconciles the manager with `slots`, unless nothing that decides a slot moved since the last pass.
     *
     * The pass is remembered only once the reconcile has gone through. A reconcile that throws halfway
     * leaves the manager partly reconciled, and the next pass with the same slots has to run it again
     * rather than skip it as done.
     */
    apply(slots: RuntimeSocketSlots, delegate: SocketSessionDelegate): void {
        const signature = slotsSignature(slots);
        if (this.last && this.last.signature === signature && this.last.delegate === delegate) return;
        reconcileSlots(this.manager, this.booted, desiredSlotsOf(slots), delegate);
        this.last = { signature, delegate };
    }

    /** Detaches every boot and forgets it; the sockets stay up. */
    detachAll(): void {
        for (const current of this.booted.values()) detach(current);
        this.booted.clear();
        this.last = null;
    }
}
