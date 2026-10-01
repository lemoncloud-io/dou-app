import { useCallback } from 'react';
import type { MyInviteView, UserTokenView } from '@lemoncloud/chatic-backend-api';
import { runtime } from '@chatic/app-runtime';

import { retryOnNetworkError } from '../lib/retryOnNetworkError';

/**
 * Step 1 of invite entry: switch into the invited cloud when the invite carries a `cloudId`.
 * No-ops when absent.
 *
 * **The cloud is entered with the invite login's own answer.** That answer is the invitee's cloud
 * token, issued for the device the invite was accepted on, and entering an invited cloud has to work
 * whatever the relay user is — a guest, or an account the guest has since signed in to. A switch that
 * re-issues through `delegate-cloud` instead answers for the relay user as it is now: after a sign-in
 * that is the account, which the invite was never bound to, and the cloud opened as a user with no
 * rooms. For the same reason an invite into the cloud already selected is still entered — the user
 * the session holds there may not be the invitee.
 *
 * The runtime falls back to an ordinary re-issued switch when the answer cannot be entered with
 * (no identity token, no endpoint). That path is relay-signed, and an app opened cold by the invite
 * link has a stale relay credential for its first seconds, so a switch that fails without an HTTP
 * answer is retried a few times before it is reported (see `retryOnNetworkError`).
 *
 * `cloudId`/`$envs` are sourced from the invite view (the backend includes them at runtime); the
 * param type widens `MyInviteView` since the published type does not yet declare `cloudId`.
 */
export const useEnterInvitedCloud = () => {
    const { switchCloud, isPending: isEnteringCloud } = runtime.session.useSwitchCloudSession();
    const { selectedCloudId } = runtime.session.useSessionSelection();

    const enterCloud = useCallback(
        async (
            info?: MyInviteView & { cloudId?: string; $envs?: { backend?: string; wss?: string } },
            inviteToken?: UserTokenView
        ): Promise<void> => {
            const cloudId = info?.cloudId;
            if (!cloudId) return;
            if (!inviteToken && cloudId === selectedCloudId) return;

            const inviteLogin = inviteToken
                ? { cloudToken: inviteToken, backend: info?.$envs?.backend, wss: info?.$envs?.wss }
                : undefined;
            await retryOnNetworkError(() => switchCloud(cloudId, { inviteLogin }));
        },
        [switchCloud, selectedCloudId]
    );

    return { enterCloud, isEnteringCloud };
};
