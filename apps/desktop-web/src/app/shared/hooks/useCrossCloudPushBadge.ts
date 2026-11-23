import { useEffect } from 'react';

import { runtime, pushCloudIdOf, RELAY_CLOUD_ID } from '@chatic/runtime';

import { useCloudPushBadgeStore } from '../stores';
import { resolvePushCloudId } from '../utils';

export const useCrossCloudPushBadge = (): void => {
    const session = runtime.session.useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : RELAY_CLOUD_ID;
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const mark = useCloudPushBadgeStore(s => s.mark);
    const clear = useCloudPushBadgeStore(s => s.clear);

    useEffect(() => {
        return runtime.push.notifications?.onReceive(payload => {
            const data = (payload.notification as { data?: Record<string, string> } | undefined)?.data;
            if (!data) return;
            const apply = (cid: string | null | undefined) => {
                if (!cid) return;
                const activeServer = runtime.session.getGlobalSessionContext().activeServer;
                const activeCloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : RELAY_CLOUD_ID;
                if (cid === activeCloudId) return;
                mark(cid);
            };

            const stamped = pushCloudIdOf(data.cid);
            if (stamped) {
                apply(stamped);
                return;
            }
            void resolvePushCloudId({
                channelId: data.channelId,
                sid: data.sid,
                channelName: data.channelName,
                uid: data.uid,
            }).then(apply);
        });
    }, [mark]);

    const activeBadged = useCloudPushBadgeStore(s => (cloudId ? !!s.badged[cloudId] : false));
    useEffect(() => {
        if (isVerified && cloudId && activeBadged) clear(cloudId);
    }, [isVerified, cloudId, activeBadged, clear]);
};
