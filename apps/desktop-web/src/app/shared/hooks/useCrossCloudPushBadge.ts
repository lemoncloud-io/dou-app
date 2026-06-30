import { useEffect } from 'react';

import { webClient } from '@chatic/bridges';
import { getGlobalSessionContext, useGlobalSession } from '@chatic/web-core';
import { useSocketState } from '@chatic/app-runtime';

import { useCloudPushBadgeStore, useMyCloudUidStore } from '../stores';
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
 * and `clear` below) by the RELAY cloud id (`session.activeServer.cloudId`, e.g.
 * `1000004`). But an invited cloud's data — channel records, the push — is stamped
 * with the backend AWS account-no (e.g. `543182730172`), a DIFFERENT id, and
 * invited clouds aren't in the relay catalog so there's no `$envs.accountNo` bridge.
 * Marking the account-no would never match a rail tile (the dot never renders).
 *
 * The reliable bridge is `data.uid` — my id in the SOURCE cloud. `useMyCloudUidStore`
 * keys `${relayCloudId}:${sid}` → that uid (written by `useSiteProfiles`, whose `cid`
 * IS the relay id), so reverse it to the relay id every rail surface uses. Fall back
 * to `data.cid` (when a backend finally stamps it) and last to the channel-cache
 * reverse-lookup. Deeplink-only events carry no uid/cid/channelId and resolve to
 * nothing — no badge beats a wrong badge. No-op in a plain browser.
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

            // Primary: `data.uid` (my id in the source cloud) reverse-mapped through the
            // persisted per-cloud uid map to the RELAY cloud id the rail keys tiles by.
            if (data.uid) {
                const entry = Object.entries(useMyCloudUidStore.getState().byPlace).find(([, uid]) => uid === data.uid);
                if (entry) {
                    apply(entry[0].split(':')[0]);
                    return;
                }
            }
            // A backend that stamps `data.cid` — already a usable cloud id.
            if (data.cid) {
                apply(data.cid);
                return;
            }
            // Last resort: reverse-look the channel up in the per-cloud cache. Returns the
            // backend account-no, which only matches the rail for catalog clouds whose relay
            // id equals their account-no — but better than nothing when the uid map is cold.
            void resolvePushCloudId({
                channelId: data.channelId,
                sid: data.sid,
                channelName: data.channelName,
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
