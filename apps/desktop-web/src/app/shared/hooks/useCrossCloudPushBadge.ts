import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { getGlobalSessionContext, useGlobalSession } from '@chatic/web-core';
import { useSocketState } from '@chatic/app-runtime';

import { useCloudPushBadgeStore } from '../stores';
import { resolvePushCloudId } from '../utils';

/**
 * Cross-cloud push → rail badge. The live socket only covers the active cloud,
 * so a message in another cloud is invisible in-app even though its FCM push
 * arrives (the shell forwards every push as `OnReceiveNotification`). Mark that
 * push's source cloud so its rail tile shows a dot; the flag clears once that
 * cloud becomes the verified active one (covers switch, boot auto-select, and
 * invite entry alike).
 *
 * Source cloud: `data.cid` when the backend stamps it; the deployed backends
 * send `""`, so fall back to reverse-looking the push's channel up in the
 * per-cloud cache (resolvePushCloudId — unique match only). Deeplink-only
 * events (toast clicks) carry neither cid nor channelId and resolve to nothing
 * — no badge is better than a wrong badge. No-op in a plain browser.
 */
export const useCrossCloudPushBadge = (): void => {
    // `cloudId` is gone from socket state in v2 — derive the active cloud from the session.
    const session = useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const { isVerified } = useSocketState();
    const mark = useCloudPushBadgeStore(s => s.mark);
    const clear = useCloudPushBadgeStore(s => s.clear);

    useEffect(() => {
        return webClient.onEvent('OnReceiveNotification', message => {
            const notification = (message?.data as { notification?: { data?: Record<string, string> } })?.notification;
            const data = notification?.data;
            if (!data) return;
            const apply = (cid: string | null | undefined) => {
                if (!cid) return;
                // The active cloud's unread is owned by the live socket pipeline. Read the
                // current active cloud imperatively (the effect closure is registered once).
                const activeServer = getGlobalSessionContext().activeServer;
                const activeCloudId = activeServer.kind === 'cloud' ? activeServer.cloudId : null;
                if (cid === activeCloudId) return;
                mark(cid);
            };
            if (data.cid) {
                apply(data.cid);
                return;
            }
            void resolvePushCloudId({
                channelId: data.channelId,
                sid: data.sid,
                channelName: data.channelName,
                // `data.uid` is the user's id in the SOURCE cloud — unique per cloud, so it
                // resolves the cloud when the channelId reverse-lookup is ambiguous.
                uid: data.uid,
            }).then(apply);
        });
    }, [mark]);

    // Visiting a cloud consumes its badge — once the handshake verifies, the
    // user is looking at it and the socket unread takes over.
    useEffect(() => {
        if (isVerified && cloudId) clear(cloudId);
    }, [isVerified, cloudId, clear]);
};
