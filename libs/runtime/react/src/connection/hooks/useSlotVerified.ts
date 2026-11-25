import { useSyncExternalStore } from 'react';

import type { SlotKey } from '@chatic/runtime-client';

import { readConnection, subscribeConnection } from '@chatic/runtime-client';

export const useSlotVerified = (slot: SlotKey): boolean => {
    const read = () => readConnection().verifiedSlots.includes(slot);
    return useSyncExternalStore(subscribeConnection, read, read);
};
