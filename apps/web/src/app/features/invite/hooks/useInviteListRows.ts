import { useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';

/**
 * Sent-invite rows for the list-integration surfaces (home `ChannelList`,
 * `PlaceChannelManagePage`) — both render the same filtered set the same way.
 *
 * Which states pass (ADR-0043):
 * - `pending` / `expired` — live cards the sender can still act on (wait, reissue, cancel).
 * - `rejected` — shown with a "초대 거절" badge so the sender learns about it (there is no
 *   notification packet — 백엔드 요청 #4); reissuing dismisses it locally.
 * - `accepted` is excluded: the real channel takes over as the visible row
 *   (see `useAcceptedChannelSync`), so showing both would duplicate the entry.
 * - `canceled` is excluded: the sender retired it.
 * - Locally dismissed rows (`useLocallyCanceledInvites`) are excluded — rejected rows the user
 *   already re-invited over, plus legacy pre-API cancel stamps awaiting reconcile.
 */
export const useInviteListRows = (): { invites: MyInviteView[]; isLoading: boolean } => {
    const { invites, isLoading } = useRelayInvites();
    const { isCanceled } = useLocallyCanceledInvites();

    const rows = useMemo(
        () =>
            invites.filter(
                invite =>
                    !!invite.id &&
                    (invite.state === 'pending' || invite.state === 'expired' || invite.state === 'rejected') &&
                    !isCanceled(invite.id)
            ),
        [invites, isCanceled]
    );

    return { invites: rows, isLoading };
};
