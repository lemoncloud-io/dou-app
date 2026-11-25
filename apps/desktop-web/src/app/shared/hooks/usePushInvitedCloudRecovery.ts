import { useEffect } from 'react';

import { runtime, pushCloudIdOf, RELAY_CLOUD_ID } from '@chatic/runtime-react';

import { useOwnedCloudIds } from './useCloudCatalog';

const inflight = new Set<string>();

export const usePushInvitedCloudRecovery = (): void => {
    const owned = useOwnedCloudIds();

    useEffect(() => {
        const notifications = runtime.push.notifications;
        if (!notifications) return;
        return notifications.onReceive(({ notification }) => {
            const data: Record<string, string> | undefined = notification?.data;
            const cid = pushCloudIdOf(data?.cid);
            if (!cid || cid === RELAY_CLOUD_ID || owned.has(cid) || inflight.has(cid)) return;
            inflight.add(cid);
            void runtime.data
                .recoverInvitedCloudIfMissing(cid)
                .catch(() => undefined)
                .finally(() => {
                    inflight.delete(cid);
                });
        });
    }, [owned]);
};
