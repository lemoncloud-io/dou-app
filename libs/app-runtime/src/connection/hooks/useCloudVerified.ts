import { RELAY_CLOUD_ID } from '@chatic/data';

import { slotKeyOf } from '../../socket/utils/slotKey';
import { useSlotVerified } from './useSlotVerified';

/**
 * Whether `cid`'s own socket slot is verified — the gate for work addressed to that cloud (a sync
 * target registered with `{ cid }`, a cache read that must follow its socket), which may not be the
 * active slot `useRuntimeSocketState` describes. A missing id is the relay, so an app holding a
 * cloud id never has to build a slot key itself.
 */
export const useCloudVerified = (cid: string | null | undefined): boolean =>
    useSlotVerified(slotKeyOf(cid || RELAY_CLOUD_ID));
