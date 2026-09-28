import { useSyncExternalStore } from 'react';

import { getSocketManager } from '../../socket/runtime';
import type { SlotKey } from '../../socket/types';

/**
 * Reactively tracks whether a SPECIFIC socket slot is auth-verified, independent of which slot is
 * ACTIVE.
 *
 * `useRuntimeSocketState().isVerified` tracks the active slot (the one `setActiveSlot` names, else relay)
 * — it cannot express "relay is up" while a cloud slot is active, or vice versa. Anything gating a
 * request pinned via `getScopedClient(slot)` (e.g. the relay-only invite gateway) must gate on this
 * instead, or it races the wrong slot's handshake.
 */
export const useSlotVerified = (slot: SlotKey): boolean => {
    const manager = getSocketManager();
    return useSyncExternalStore(
        listener => manager.subscribeSlotVerified(slot, listener),
        () => manager.isSlotVerified(slot)
    );
};
