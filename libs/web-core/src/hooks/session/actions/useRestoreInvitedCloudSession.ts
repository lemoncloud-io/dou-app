import { restorePreviousCloudSession } from '../../../session/services';
import { useCallback } from 'react';

/**
 * Restores a previously cached invited cloud session.
 */
export const useRestoreInvitedCloudSession = () => ({
    restoreInvitedCloud: useCallback((cloudId: string) => restorePreviousCloudSession(cloudId), []),
});
