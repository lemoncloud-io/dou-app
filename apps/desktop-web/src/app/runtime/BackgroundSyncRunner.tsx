import { useBackgroundSync } from './useBackgroundSync';

/**
 * Mounts the global background sync. Renders nothing; placed once under DesktopRuntime so
 * place/channel/profile list polling runs across all routes for the runtime's lifetime.
 */
export const BackgroundSyncRunner = (): null => {
    useBackgroundSync();
    return null;
};
