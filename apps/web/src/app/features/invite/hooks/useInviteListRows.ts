import { useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';

/**
 * Sent-invite rows for the list-integration surfaces (home `ChannelList`,
 * `PlaceChannelManagePage`) — both render the same filtered set the same way.
 *
 * `accepted` invites are excluded: once accepted, the real channel is expected to take over as
 * the visible row (see `useAcceptedChannelSync`), so showing both would duplicate the entry.
 * Locally-canceled invites (the cancel stub — 백엔드 요청 #1) are excluded too, since canceling is
 * only ever a local hide, not a server mutation.
 */
export const useInviteListRows = (): { invites: MyInviteView[]; isLoading: boolean } => {
    const { invites, isLoading } = useRelayInvites();
    const { isCanceled } = useLocallyCanceledInvites();

    const rows = useMemo(
        () =>
            invites.filter(
                invite =>
                    !!invite.id && (invite.state === 'pending' || invite.state === 'expired') && !isCanceled(invite.id)
            ),
        [invites, isCanceled]
    );

    return { invites: rows, isLoading };
};
