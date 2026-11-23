import { runtime } from '@chatic/runtime';

import { useRelayInvites } from '../../../hooks';

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
