import { useCallback } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useStackNavigate } from '../../../../navigation';
import { usePendingInviteChannel } from '../../../../stores/usePendingInviteChannel';
import { ROUTES } from '../../../../routes/paths';

export const useEnterInvitedChannel = () => {
    const enterStack = useStackNavigate();
    const setPendingChannel = usePendingInviteChannel(state => state.setPendingChannel);

    const enterChannel = useCallback(
        (info?: MyInviteView): void => {
            if (info?.channelId) setPendingChannel(info.channelId);
            enterStack('deeplink', ROUTES.home);
        },
        [enterStack, setPendingChannel]
    );

    return { enterChannel };
};
