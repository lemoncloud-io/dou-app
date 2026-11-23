import { useCallback } from 'react';

import { logger } from '@chatic/bridges';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInviteMutations, useRelayInvites } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';
import { resolveInviteCode } from '../utils/inviteCode';
import { getSocketErrorCode } from '../../../utils/errors';

export type RetireOutcome = 'canceled' | 'dismissed' | 'conflict' | 'failed' | 'skipped';

export const useRetireInvite = () => {
    const { invites, refetch } = useRelayInvites();
    const { cancelInvite } = useRelayInviteMutations();
    const { markCanceled } = useLocallyCanceledInvites();

    const retire = useCallback(
        async (invite: MyInviteView): Promise<RetireOutcome> => {
            switch (invite.state) {
                case 'pending':
                case 'expired': {
                    const code = invite.id ? await resolveInviteCode(invites, refetch, invite.id) : undefined;
                    if (!code) {
                        logger.error('INVITE', '[useRetireInvite] invite row carries no code to cancel', {
                            id: invite.id,
                            state: invite.state,
                        });
                        return 'failed';
                    }
                    try {
                        await cancelInvite(code);
                        return 'canceled';
                    } catch (error) {
                        const status = getSocketErrorCode(error);
                        logger.error('INVITE', `[useRetireInvite] invite.cancel failed (status=${status ?? '-'})`, {
                            error,
                            id: invite.id,
                            state: invite.state,
                        });
                        return status === 409 ? 'conflict' : 'failed';
                    }
                }
                case 'rejected': {
                    if (invite.id) markCanceled(invite.id);
                    return 'dismissed';
                }
                default:
                    return 'skipped';
            }
        },
        [invites, refetch, cancelInvite, markCanceled]
    );

    return { retire };
};
