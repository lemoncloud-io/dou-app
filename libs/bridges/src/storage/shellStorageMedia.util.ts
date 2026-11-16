import type { StorageMedium } from '@chatic/bridge-messages';

import { hostProfile } from '../host/hostProfile';

/**
 * Whether the shell this page runs in keeps `medium` — read from what it injected, and from nothing
 * else. `isNative()` cannot answer it: it is true in every shell, including ones that keep no vault.
 * The list is the one the host profile took at boot.
 */
export const shellKeepsStorageMedium = (medium: StorageMedium): boolean => hostProfile().storageMedia.includes(medium);
