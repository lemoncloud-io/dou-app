import type { StorageMedium } from '@chatic/bridge-messages';

/**
 * Whether the shell this page runs in keeps `medium` — read from what it injected, and from nothing
 * else. `isNative()` cannot answer it: it is true in every shell, including ones that keep no vault.
 */
export const shellKeepsStorageMedium = (medium: StorageMedium): boolean => {
    if (typeof window === 'undefined') return false;
    const media = window.CHATIC_APP_STORAGE_MEDIA;
    return Array.isArray(media) && media.includes(medium);
};
