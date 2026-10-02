import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useStackNavigate } from '../../../../navigation';
import { usePendingInviteChannel } from '../../../../stores/usePendingInviteChannel';
import { ROUTES } from '../../../../routes/paths';

/**
 * Step 3 of invite entry: leave the accept screen, and hand over the room when there is one. The
 * cloud and the place are already switched by the steps before this one, so all that is left is
 * where the reader ends up.
 *
 * When the invite carries a `channelId` it is stashed as the pending invite channel, and
 * `useOpenPendingInviteChannel` in the layout opens that room on whatever screen leaving lands on.
 * The flow is: accept → connect place → (the place profile, when there is none there — see
 * useInviteAccept) → channel.
 */
export const useEnterInvitedChannel = () => {
    const enterStack = useStackNavigate();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const enterChannel = useCallback(
        (info?: MyInviteView): void => {
            if (info?.channelId) setPendingChannel(info.channelId);
            // Home is the fallback, not the destination. A link that arrived while the app was
            // already open has the reader's previous screen underneath, and rewinding onto it is
            // what stops the acceptance screen from staying in the backward path. The room, if
            // any, opens on top of that screen.
            enterStack('deeplink', ROUTES.home);
        },
        [enterStack, setPendingChannel]
    );

    return { enterChannel };
};
