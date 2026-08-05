import { useCallback } from 'react';

import { logger } from '@chatic/bridges';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useRelayInviteMutations } from '../../../hooks';
import { useLocallyCanceledInvites } from './useLocallyCanceledInvites';
import { composeInviteCode } from '../utils/inviteCode';
import { getSocketErrorCode } from '../../../utils/errors';

/**
 * What happened to the prior invite (feature doc "재발급·정리(retire) 규칙"):
 * - `canceled`  — server cancel went through (or was already final; the call is idempotent).
 * - `dismissed` — a `rejected` invite was hidden locally. The server keeps rejected forever and
 *   cancel does not overwrite a final mark, so a local dismiss is the only way to clear the row.
 * - `conflict`  — 409: it got accepted meanwhile. Callers re-ask the list instead of proceeding.
 * - `failed`    — cancel could not be delivered (or the row carries no code to compose).
 * - `skipped`   — nothing to do (`canceled`/`accepted`/unknown state).
 */
export type RetireOutcome = 'canceled' | 'dismissed' | 'conflict' | 'failed' | 'skipped';

/**
 * Retire the previous invite before issuing a replacement (ADR-0043 결정 5).
 *
 * Callers own the abort policy: a `pending` prior must retire as `canceled` before a new code is
 * issued (otherwise two live codes exist for the same phone), while an `expired` prior is
 * best-effort tidying — the old link is already dead, so `failed` does not block the reissue.
 */
export const useRetireInvite = () => {
    const { cancelInvite } = useRelayInviteMutations();
    const { markCanceled } = useLocallyCanceledInvites();

    const retire = useCallback(
        async (invite: MyInviteView): Promise<RetireOutcome> => {
            switch (invite.state) {
                case 'pending':
                case 'expired': {
                    const code = composeInviteCode(invite);
                    if (!code) {
                        // A row the server answered without `id`/`code`. The caller can only report a
                        // generic failure from here, so say which invite it was while we still know.
                        logger.error('INVITE', '[useRetireInvite] invite row carries no code to cancel', {
                            id: invite.id,
                            state: invite.state,
                        });
                        return 'failed';
                    }
                    try {
                        // The resolved view may come back `rejected` rather than `canceled` when the
                        // recipient declined in the meantime — the call is idempotent on final marks
                        // and either way the old link is dead, so any resolution counts as retired.
                        await cancelInvite(code);
                        return 'canceled';
                    } catch (error) {
                        const status = getSocketErrorCode(error);
                        // Outcomes are a closed set, so the server's own message dies here unless it is
                        // logged — and `failed` is exactly the case someone will need to diagnose. The
                        // code itself is a credential and never goes in the log.
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
        [cancelInvite, markCanceled]
    );

    return { retire };
};
