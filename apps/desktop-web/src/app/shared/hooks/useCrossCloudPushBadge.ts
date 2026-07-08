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
 * Source cloud — which id space? The rail keys tiles (and the active highlight,
 * and `clear` below) by the RELAY cloud id (`session.activeServer.cloudId`). The
 * reliable resolver is `resolvePushCloudId`: the engine partitions the channel
 * cache by that same relay cloud id (`useRuntimeBinding` cid = selectedCloudId),
 * so a channel-cache reverse-lookup returns the rail's id directly. It also
 * handles invited clouds via the source-cloud uid when that uid is UNIQUE to one
 * cloud. (A push's `data.uid` is the account id — identical across your own
 * catalog clouds — so it can NOT be reverse-mapped through a per-cloud uid store;
 * `resolvePushCloudId` only trusts uid when it resolves to exactly one cloud.)
 * `data.cid` short-circuits when a backend finally stamps it. Deeplink-only events
 * carry no channelId and resolve to nothing. No-op in a plain browser.
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

            // A backend that stamps `data.cid` — already a usable cloud id.
            if (data.cid) {
                apply(data.cid);
                return;
            }
            // Resolve the source cloud from the channel cache (returns the relay cloud id
            // the rail keys by), trusting `data.uid` only when it maps to a single cloud.
            void resolvePushCloudId({
                channelId: data.channelId,
                sid: data.sid,
                channelName: data.channelName,
                uid: data.uid,
            }).then(apply);
        });
    }, [mark]);

    // Visiting a cloud consumes its badge — once the handshake verifies, the
    // user is looking at it and the socket unread takes over. Keyed on whether the
    // active cloud is currently badged (not just the verify/switch edge) so a mark
    // that lands AFTER the handshake is still swept: a push arriving during the
    // relay-fallback / mid-switch window gets attributed to the now-active cloud, and
    // without this the edge never re-fires and the tile (and the +1 dock badge) stick.
    const activeBadged = useCloudPushBadgeStore(s => (cloudId ? !!s.badged[cloudId] : false));
    useEffect(() => {
        if (isVerified && cloudId && activeBadged) clear(cloudId);
    }, [isVerified, cloudId, activeBadged, clear]);
};
