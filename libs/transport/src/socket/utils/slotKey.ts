import { RELAY_CLOUD_ID } from '@chatic/data';

import type { SlotKey, SocketKind } from '../types';

/**
 * The words a slot used to be addressed by, before slots were keyed by the cloud they serve.
 *
 * No cloud is named either of them, so seeing one here can only mean a caller that has not been
 * migrated — typically one that cast its way past `SlotKey`. Failing loudly is the point: a `'relay'`
 * that quietly became a key would name a slot that never exists, and a subscription registered on it
 * would simply wait forever.
 */
const LEGACY_SLOT_WORDS: ReadonlySet<string> = new Set(['relay', 'cloud']);

/**
 * The key of the slot serving `cid`.
 *
 * `'#'` is not accepted as the relay's cid: it is the relay marker in the backend's PUSH payload only,
 * translated where a push is read. Inside the runtime the relay is `RELAY_CLOUD_ID` — the same value
 * the cache partitions under — so one server has one name.
 */
export const slotKeyOf = (cid: string): SlotKey => {
    if (!cid || LEGACY_SLOT_WORDS.has(cid)) {
        throw new Error(`[slotKey] "${cid}" is not a cloud id — slots are keyed by cid (relay = "${RELAY_CLOUD_ID}")`);
    }
    return cid as SlotKey;
};

/** The relay's slot. */
export const RELAY_SLOT: SlotKey = slotKeyOf(RELAY_CLOUD_ID);

/**
 * Which server a slot serves, derived from its key and nothing else.
 *
 * Not from a token: a relay token can carry a `cloudId`, so a token-derived answer could call the
 * relay a cloud. The key is fixed when the slot is created, so this answer is too.
 */
export const kindOf = (key: SlotKey): SocketKind => (key === RELAY_SLOT ? 'relay' : 'cloud');
