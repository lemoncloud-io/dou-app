import { useEffect, useRef } from 'react';

import { pushCloudIdOf, RELAY_CLOUD_ID, runtime } from '@chatic/runtime';

import { extractPushContext } from '../utils/resolveInAppPushRoute';

export const InvitedCloudDurabilityRunner = (): null => {
    const inflightRef = useRef(new Set<string>());

    runtime.data.useInvitedCloudNameSync();

    useEffect(() => {
        const notifications = runtime.push.notifications;
        if (!notifications) return;
        return notifications.onReceive(({ notification }) => {
            const data = notification?.data;
            if (!data) return;
            const cloudId = pushCloudIdOf(extractPushContext(data).cid);
            if (!cloudId || cloudId === RELAY_CLOUD_ID) return;

            const inflight = inflightRef.current;
            if (inflight.has(cloudId)) return;
            inflight.add(cloudId);
            void runtime.data
                .recoverInvitedCloudIfMissing(cloudId)
                .catch(() => undefined)
                .finally(() => {
                    inflight.delete(cloudId);
                });
        });
    }, []);

    return null;
};
