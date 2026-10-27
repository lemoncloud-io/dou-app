import { createQueryKeys } from '@chatic/shared';

/** The pairings this account approved (`GET /pairings` on the relay). */
export const pairingsKeys = createQueryKeys('pairings');

/**
 * This account's devices. The list is read on the active slot, so its key carries the active cloud —
 * the relay's devices and a cloud's are different lists, and one must not stand in for the other.
 */
export const devicesKeys = createQueryKeys('devices');
