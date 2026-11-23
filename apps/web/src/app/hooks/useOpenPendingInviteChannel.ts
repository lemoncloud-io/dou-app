import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { logger } from '@chatic/bridges';

import { useStackNavigate } from '../navigation';
import { ROUTES } from '../routes/paths';
import { usePendingInviteChannel } from '../stores/usePendingInviteChannel';

export const useOpenPendingInviteChannel = (): void => {
    const { pathname } = useLocation();
    const enterStack = useStackNavigate();
    const channelId = usePendingInviteChannel(state => state.channelId);

    useEffect(() => {
        if (!channelId || pathname === ROUTES.invite.accept) return;
        const pending = usePendingInviteChannel.getState();
        if (pending.channelId !== channelId) return;
        pending.clearPendingChannel();
        logger.info('INVITE', 'opening the invited room on landing', { channelId, landedOn: pathname });
        enterStack('push', ROUTES.channels.room(channelId));
    }, [channelId, pathname, enterStack]);
};
