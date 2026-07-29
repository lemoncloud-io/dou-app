import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useNavigateWithTransition } from '@chatic/shared';

import { usePendingInviteChannel } from '../../../stores/usePendingInviteChannel';
import { ROUTES } from '../../../routes/paths';

/**
 * Step 3 of invite entry: always land on home so the newly-entered site becomes the active place.
 * When the invite carries a `channelId` it is stashed as the pending invite channel and HomePage
 * opens that room immediately — the place profile is optional and no longer gates entry, so the
 * flow is: accept → connect place → channel.
 */
export const useEnterInvitedChannel = () => {
    const navigate = useNavigateWithTransition();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const enterChannel = useCallback(
        (info?: MyInviteView): void => {
            if (info?.channelId) setPendingChannel(info.channelId);
            navigate(ROUTES.home, { replace: true });
        },
        [navigate, setPendingChannel]
    );

    return { enterChannel };
};
