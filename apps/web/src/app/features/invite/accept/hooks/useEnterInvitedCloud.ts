import { useCallback } from 'react';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { runtime } from '@chatic/runtime';

import { retryOnNetworkError } from '../lib/retryOnNetworkError';

export const useEnterInvitedCloud = () => {
    const { switchCloud, isPending: isEnteringCloud } = runtime.session.useSwitchCloudSession();
    const { selectedCloudId } = runtime.session.useSessionSelection();

    const enterCloud = useCallback(
        async (
            info?: MyInviteView & { cloudId?: string; $envs?: { backend?: string; wss?: string } },
            inviteLogin?: runtime.session.InviteLogin
        ): Promise<void> => {
            const cloudId = info?.cloudId;
            if (!cloudId) {
                if (inviteLogin) runtime.session.forgetInviteLogin(inviteLogin.handle);
                return;
            }
            if (!inviteLogin && cloudId === selectedCloudId) return;

            const entry = inviteLogin
                ? { ...inviteLogin, backend: info?.$envs?.backend, wss: info?.$envs?.wss }
                : undefined;
            await retryOnNetworkError(() => switchCloud(cloudId, { inviteLogin: entry }));
        },
        [switchCloud, selectedCloudId]
    );

    return { enterCloud, isEnteringCloud };
};
