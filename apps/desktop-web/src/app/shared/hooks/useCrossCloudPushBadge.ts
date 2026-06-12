import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';

import { useCloudPushBadgeStore } from '../stores';

/**
 * Cross-cloud push → rail badge. The live socket only covers the active cloud,
 * so a message in another cloud is invisible in-app even though its FCM push
 * arrives (the shell forwards every push as `OnReceiveNotification`). Mark that
 * push's source cloud (`data.cid`, set by the backend push payload) so its rail
 * tile shows a dot; the flag clears once that cloud becomes the verified active
 * one (covers switch, boot auto-select, and invite entry alike).
 *
 * Deeplink-only events (toast clicks) carry no `cid` and pushes without one are
 * skipped — no badge is better than a wrong badge. No-op in a plain browser.
 */
export const useCrossCloudPushBadge = (): void => {
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const mark = useCloudPushBadgeStore(s => s.mark);
    const clear = useCloudPushBadgeStore(s => s.clear);

    useEffect(() => {
        return webClient.onEvent('OnReceiveNotification', message => {
            const notification = (message?.data as { notification?: { data?: Record<string, string> } })?.notification;
            const cid = notification?.data?.cid;
            if (!cid) return;
            // The active cloud's unread is owned by the live socket pipeline.
            if (cid === useWebSocketV2Store.getState().cloudId) return;
            mark(cid);
        });
    }, [mark]);

    // Visiting a cloud consumes its badge — once the handshake verifies, the
    // user is looking at it and the socket unread takes over.
    useEffect(() => {
        if (isVerified && cloudId) clear(cloudId);
    }, [isVerified, cloudId, clear]);
};
