import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { getSocketManager } from '../socket/runtime';
import { getSyncManager } from '../socket/sync/runtime';
import { bootstrapSocketConnection } from '../socket';
import type { ISocketManager, SlotKey, SocketBindingConfig, SocketSessionDelegate } from '../socket';
import { kindOf, slotKeyOf } from '../socket/utils/slotKey';
import type { RuntimeSocketSlots } from './types';
import { socketRebootKey } from './utils/socketRebootKey';

export interface SocketBinderProps {
    slots: RuntimeSocketSlots;
    delegate: SocketSessionDelegate;
}

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
 * What the reconcile effect is keyed on: each desired slot's key and reboot key, and the slot to make
 * active. The slots object is fresh on every session mutation, so keying on this string keeps benign
 * re-renders from re-running the effect. The live configs are read from a ref.
 *
 * The active slot has to be in it on its own. A switch between two clouds that both hold a slot —
 * one committed, one in the background — leaves the set of slots and every reboot key exactly as they
 * were; only which of them is active moves. Keyed on the set alone, that switch never re-ran the
 * effect and the facade stayed on the cloud the user had left.
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
 * set is cleared on unmount (see below), so a remount that asks for fewer slots would otherwise leave
 * the missing ones bound with nothing left to tear them down.
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
 * is one. One reconcile effect owns every slot, so the order across
 * slots is decided in one place (see `reconcileSlots`) instead of falling out of which of two
 * independent effects React happened to run first.
 *
 * A slot is identified by its key — the cloud it serves — plus its reboot key `url|deviceId|wssType`.
 * A different cloud is therefore always a different slot, whatever its URL, and a cloud moving
 * between background and committed is the SAME slot: its key and reboot key do not change, so the
 * client and its connection are reused. The identity token is not
 * part of either, because a refresh must not reboot a healthy socket.
 *
 * Unmount detaches every boot's SDK subscriptions and forgets them, but does not destroy the sockets
 * — the same as before. That is what StrictMode's mount → unmount → mount relies on: the second
 * mount re-bootstraps each slot, `ensure` finds the config unchanged and reuses the client, and the
 * first boot's late resolution detaches itself.
 */
export const SocketBinder = ({ slots, delegate }: SocketBinderProps) => {
    const socketManager = getSocketManager();
    // The sync engine must exist BEFORE a slot binds: it attaches a device runtime per bound slot,
    // and that runtime owns the slot's connect-driven `device.save` (whose `:ok` is what opens the
    // bootstrap's auth gate). Render runs before the binding effects below, so naming it here is the
    // guarantee. It used to be luck — the first repository read built the DataManager, which built
    // the socket runtime, which built the sync manager (see socket/sync/runtime.ts).
    getSyncManager();

    const bootedRef = useRef(new Map<SlotKey, BootedSlot>());
    const slotsRef = useRef(slots);
    slotsRef.current = slots;
    const signature = slotsSignature(slots);

    useEffect(() => {
        reconcileSlots(socketManager, bootedRef.current, desiredSlotsOf(slotsRef.current), delegate);
        // Keyed on the signature (not the slots object) so benign re-renders do not re-run this.
        // `slots` is read via slotsRef (a ref, so it needs no dependency entry).
    }, [signature, socketManager, delegate]);

    // Unmount only — a dependency change must not detach slots the reconcile is about to keep.
    useEffect(() => {
        const booted = bootedRef.current;
        return () => {
            for (const current of booted.values()) detach(current);
            booted.clear();
        };
    }, []);

    return null;
};
