import { useSyncExternalStore } from 'react';

import type { SlotKey } from '@chatic/transport';

import { readConnection, subscribeConnection } from '../connectionCommands';

/**
 * Reactively tracks whether a SPECIFIC socket slot is auth-verified, independent of which slot is
 * ACTIVE.
 *
 * `useRuntimeSocketState().isVerified` tracks the active slot (the one `setActiveSlot` names, else relay)
 * — it cannot express "relay is up" while a cloud slot is active, or vice versa. Anything gating a
 * request pinned to one slot (`requestOnSlot`, e.g. the relay-only invite gateway) must gate on this
 * instead, or it races the wrong slot's handshake.
 */
export const useSlotVerified = (slot: SlotKey): boolean => {
    const read = () => readConnection().verifiedSlots.includes(slot);
    return useSyncExternalStore(subscribeConnection, read, read);
};
