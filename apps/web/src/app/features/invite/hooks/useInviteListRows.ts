import { useMemo } from 'react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInvites } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';

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
