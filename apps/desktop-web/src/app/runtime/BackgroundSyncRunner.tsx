import { useInvitedCloudRecovery } from '../shared';
import { useBackgroundSync } from './useBackgroundSync';
import { useEnsureSelfChannel } from './useEnsureSelfChannel';

export const BackgroundSyncRunner = (): null => {
    useBackgroundSync();
    useInvitedCloudRecovery();
    useEnsureSelfChannel();
    return null;
};
