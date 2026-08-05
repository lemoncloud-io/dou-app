import { useInvitedCloudRecovery } from '../shared';
import { useBackgroundSync } from './useBackgroundSync';

/**
 * Mounts the global background sync. Renders nothing; placed once under DesktopRuntime so
 * place/channel/profile list polling runs across all routes for the runtime's lifetime.
 */
export const BackgroundSyncRunner = (): null => {
    useBackgroundSync();
    // Same lifetime, same job — repair the local record of the cloud we are in, which for an
    // invited cloud is the only thing that keeps it on the rail after we leave it.
    useInvitedCloudRecovery();
    return null;
};
