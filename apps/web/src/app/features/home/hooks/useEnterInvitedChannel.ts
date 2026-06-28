import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';

/**
 * Step 3 of invite entry: navigate to the invited channel room when the invite carries a
 * `channelId`, otherwise land on home. Runs after cloud/site switches so the channel resolves
 * against the active session.
 */
export const useEnterInvitedChannel = () => {
    const navigate = useNavigateWithTransition();

    const enterChannel = useCallback(
        (info?: MyInviteView): void => {
            if (info?.channelId) {
                navigate(ROUTES.channels.room(info.channelId), { replace: true });
                return;
            }
            navigate(ROUTES.home, { replace: true });
        },
        [navigate]
    );

    return { enterChannel };
};
