import { useBackgroundSync } from './useBackgroundSync';

/**
 * Mounts the global background sync. Renders nothing; placed once under AppRuntime beside
 * PreferenceLoader so polling runs across all routes for the lifetime of the runtime.
 */
export const BackgroundSyncRunner = (): null => {
    useBackgroundSync();
    return null;
};
