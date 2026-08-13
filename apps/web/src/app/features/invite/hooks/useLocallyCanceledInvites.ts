import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useRelayInvites } from '../../../hooks';

/**
 * Locally hidden sent-invite rows — a cache row's `dismissedAt` field (ADR-0052 결정 5), not a
 * separate localStorage list. Since ADR-0043 the record serves two narrow purposes:
 *
 * - **Rejected-row dismiss.** The server keeps a `rejected` invite forever (it never decays to
 *   `expired`, and `invite.cancel` does not overwrite a final mark), so once the sender re-invites
 *   the same person the old rejected row can only be cleared locally.
 * - **Legacy pre-API cancel stamps.** Cancels made while `invite.cancel` did not exist were
 *   recorded here without a server mutation; `useCanceledInviteReconcile` drains them by firing
 *   the real cancel and clearing each record once the server state is settled.
 *
 * `dismissedAt` lives on the same cache row as the invite itself rather than in a side registry —
 * the state of "is this invite hidden" was split across two stores before this (localStorage +
 * the server view), and the migration this ADR ships folds it back into one.
 */
export const useLocallyCanceledInvites = () => {
    const { invite } = useRuntimeRepositories();
    const { invites } = useRelayInvites();

    const isCanceled = (inviteId: string): boolean => !!invites.find(item => item.id === inviteId)?.dismissedAt;

    const markCanceled = (inviteId: string): void => {
        if (!inviteId) return;
        void invite.dismiss(inviteId);
    };

    const clearCanceled = (inviteId: string): void => {
        if (!inviteId) return;
        void invite.undismiss(inviteId);
    };

    return { isCanceled, markCanceled, clearCanceled };
};
