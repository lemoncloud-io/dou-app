import { useEffect } from 'react';

import { startBackgroundReceive } from '../../socket/sync/runtime';

/**
 * Runs the receive loops of the clouds the user is not looking at for as long as the host is mounted
 * (`socket/sync/BackgroundReceiver`). Off for a host handed its slots from outside, which has no
 * background clouds of its own to keep current.
 */
export const useBackgroundReceive = (enabled: boolean): void => {
    useEffect(() => (enabled ? startBackgroundReceive() : undefined), [enabled]);
};
