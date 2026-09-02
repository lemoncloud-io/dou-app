import { useCallback } from 'react';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import { useSessionSelection, useSwitchCloudSession } from '@chatic/app-runtime';

/**
 * Step 1 of invite entry: switch into the invited cloud when the invite carries a `cloudId`.
 * No-ops when absent, and skips the switch when that cloud is already active (mirrors the
 * `useSwitchPlace` guard) so re-entering the same invite doesn't re-run cloud delegation.
 *
 * Before switching, the invited cloud is persisted to the local cloud cache via the cloud
 * repository's `cacheWrite`. Invited clouds are not in the relay catalog, so this write is what
 * surfaces them to `useInvitedClouds`/the cloud sheet and carries the backend/wss endpoints
 * (from `$envs`) the session needs. `cloudType` defaults to 'invited' in the local data source.
 *
 * `cloudId`/`$envs` are sourced from the invite view (the backend includes them at runtime); the
 * param type widens `MyInviteView` since the published type does not yet declare `cloudId`.
 */
export const useEnterInvitedCloud = () => {
    const { switchCloud, isPending: isEnteringCloud } = useSwitchCloudSession();
    const { selectedCloudId } = useSessionSelection();

    const enterCloud = useCallback(
        async (info?: MyInviteView & { cloudId?: string }): Promise<void> => {
            if (!info?.cloudId || info.cloudId === selectedCloudId) return;

            await switchCloud(info.cloudId);
        },
        [switchCloud, selectedCloudId]
    );

    return { enterCloud, isEnteringCloud };
};
