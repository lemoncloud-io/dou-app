import { useMemo, useSyncExternalStore } from 'react';

import { getSocketManager } from '../../socket/runtime';
import type { SlotKey } from '../../socket/types';

/**
 * The clouds whose socket slot is bound and verified right now — the relay among them — in slot
 * order. For a consumer that works across every cloud it has a socket to, such as a resend queue that
 * may only send to a cloud whose socket can carry it. `useSlotVerified` answers the same question for
 * one slot, but a hook cannot be called once per slot of a set that changes.
 *
 * The snapshot is a joined string so an unchanged set is an unchanged snapshot, whatever order the
 * notifications arrive in.
 */
const SEPARATOR = '\n';

const readVerified = (): string => {
    const manager = getSocketManager();
    return manager
        .getSlotKeys()
        .filter(key => manager.isSlotVerified(key))
        .join(SEPARATOR);
};

const subscribe = (listener: () => void): (() => void) => {
    const manager = getSocketManager();
    // One verified subscription per bound slot, re-made as slots bind and go: a slot that appears
    // after subscribing has no subscription until the client listener adds one.
    const perSlot = new Map<SlotKey, () => void>();
    const unsubscribeClients = manager.subscribeSlotClients((key, client) => {
        perSlot.get(key)?.();
        perSlot.delete(key);
        if (client) {
            perSlot.set(key, manager.subscribeSlotVerified(key, listener));
            listener();
            return;
        }
        // A teardown is announced while the slot is still bound, and nothing is announced once it is
        // gone, so the set has to be re-read after the teardown finishes.
        queueMicrotask(listener);
    });
    return () => {
        unsubscribeClients();
        for (const unsubscribe of perSlot.values()) unsubscribe();
        perSlot.clear();
    };
};

export const useVerifiedClouds = (): readonly string[] => {
    const snapshot = useSyncExternalStore(subscribe, readVerified, readVerified);
    return useMemo(() => (snapshot ? snapshot.split(SEPARATOR) : []), [snapshot]);
};
