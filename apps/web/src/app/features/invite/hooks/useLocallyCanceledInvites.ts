import { runtime } from '@chatic/app-runtime';

import { useRelayInvites } from '../../../hooks';

/**
 * Locally hidden sent-invite rows — a cache row's `dismissedAt` field (ADR-0052 decision 5), not a
 * separate localStorage list. It serves one narrow purpose, the rejected-row dismiss: the server
 * keeps a `rejected` invite forever (it never decays to `expired`, and `invite.cancel` does not
 * overwrite a final mark), so once the sender re-invites the same person the old rejected row can
 * only be cleared locally.
 *
 * `dismissedAt` lives on the same cache row as the invite itself rather than in a side registry, so
 * "is this invite hidden" has one store, not two (localStorage + the server view).
 */
export const useLocallyCanceledInvites = () => {
    const { invite } = runtime.data.useRuntimeRepositories();
    const { invites } = useRelayInvites();

    const isCanceled = (inviteId: string): boolean => !!invites.find(item => item.id === inviteId)?.dismissedAt;

    const markCanceled = (inviteId: string): void => {
        if (!inviteId) return;
        void invite.dismiss(inviteId);
    };

    return { isCanceled, markCanceled };
};
