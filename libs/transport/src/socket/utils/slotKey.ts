import { RELAY_CLOUD_ID } from '@chatic/data';

import type { SlotKey, SocketKind } from '../types';

const LEGACY_SLOT_WORDS: ReadonlySet<string> = new Set(['relay', 'cloud']);

export const slotKeyOf = (cid: string): SlotKey => {
    if (!cid || LEGACY_SLOT_WORDS.has(cid)) {
        throw new Error(`[slotKey] "${cid}" is not a cloud id — slots are keyed by cid (relay = "${RELAY_CLOUD_ID}")`);
    }
    return cid as SlotKey;
};

export const RELAY_SLOT: SlotKey = slotKeyOf(RELAY_CLOUD_ID);

export const kindOf = (key: SlotKey): SocketKind => (key === RELAY_SLOT ? 'relay' : 'cloud');
