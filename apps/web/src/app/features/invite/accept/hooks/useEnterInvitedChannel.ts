import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useStackNavigate } from '../../../../navigation/useStackNavigate';
import { usePendingInviteChannel } from '../../../../stores/usePendingInviteChannel';
import { ROUTES } from '../../../../routes/paths';

/**
 * Step 3 of invite entry: always land on home so the newly-entered site becomes the active place.
 * When the invite carries a `channelId` it is stashed as the pending invite channel and HomePage
 * opens that room immediately — the place profile is optional and no longer gates entry, so the
 * flow is: accept → connect place → channel.
 */
export const useEnterInvitedChannel = () => {
    const enterStack = useStackNavigate();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const enterChannel = useCallback(
        (info?: MyInviteView): void => {
            if (info?.channelId) setPendingChannel(info.channelId);
            // Home is the fallback, not the destination. A link that arrived while the app was
            // already open has the reader's previous screen underneath, and rewinding onto it is
            // what stops the acceptance screen from staying in the backward path.
            enterStack('deeplink', ROUTES.home);
        },
        [enterStack, setPendingChannel]
    );

    return { enterChannel };
};
