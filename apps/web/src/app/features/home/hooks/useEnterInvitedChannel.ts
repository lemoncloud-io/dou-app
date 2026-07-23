import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useNavigateWithTransition } from '@chatic/shared';

import { usePendingInviteChannel } from '../../../stores/usePendingInviteChannel';
import { ROUTES } from '../../../routes/paths';

/**
 * Step 3 of invite entry: always land on home so the mandatory place-profile gate can run for the
 * newly-entered site (first entry ⇒ no profile yet). When the invite carries a `channelId` it is
 * stashed as the pending invite channel; HomePage opens that room once the profile exists (created
 * just now, or already present). This enforces: accept → connect place → profile setup → channel.
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
