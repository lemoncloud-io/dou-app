import { RELAY_CLOUD_ID, slotKeyOf } from '@chatic/runtime-client';

import { useSlotVerified } from './useSlotVerified';

export const useCloudVerified = (cid: string | null | undefined): boolean =>
    useSlotVerified(slotKeyOf(cid || RELAY_CLOUD_ID));
