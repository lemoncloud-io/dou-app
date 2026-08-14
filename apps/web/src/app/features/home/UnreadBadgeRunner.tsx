import { useCallback, useEffect } from 'react';

import { useSessionSelection } from '@chatic/web-core';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudUnreads, useOtherCloudUnread } from '../../hooks';

/**
 * App-global unread badge. Mounted once under AppRuntime (not the home page) so the native
 * app-icon badge stays correct on every route.
 *
 * The number is two halves. The active cloud is observed live — its channel list and my join
 * cursors stream from the cache, so a read drops the badge immediately. Every other cloud is read
 * from the local cache by `useOtherCloudUnread`, recomputed from each channel's head and my read
 * cursor rather than remembered as a total.
 *
 * That second half used to be a localStorage snapshot of each cloud's last-visited count, and
 * nothing ever cleared an inactive cloud's entry — a count frozen when you switched away sat on
 * the app icon indefinitely, which is the phantom badge people saw after reading everything.
 * Recomputing has no frozen entry to strand: it follows the cache, and an inactive cloud that
 * leaves the cache leaves the count.
 *
 * The cache is still only as fresh as that cloud's last visit — messages that arrived since, or
 * reads made on another device, are invisible until it is opened again. Closing that gap needs a
 * server-side summary and cannot be done from the client.
 */
export const UnreadBadgeRunner = (): null => {
    // Shared with HomePage's `byPlace` (ADR-0056) — see useActiveCloudUnreads for why this stays
    // observe-only (no per-channel join sync registration lives here).
    const { total } = useActiveCloudUnreads();
    const { selectedCloudId } = useSessionSelection();
    const { total: otherTotal, refresh: refreshOtherClouds } = useOtherCloudUnread(selectedCloudId);

    const pushBadge = useCallback(() => {
        appBridge.setBadgeCount(total + otherTotal);
    }, [total, otherTotal]);

    useEffect(() => {
        pushBadge();
    }, [pushBadge]);

    // The active cloud's count moving is the app's best hint that the cache changed at all — a
    // send, a read, an arriving message. Re-read the other clouds on the same beat so a cloud
    // synced in the background (push recovery, cold sync) does not wait for a switch to show up.
    useEffect(() => {
        refreshOtherClouds();
    }, [total, refreshOtherClouds]);

    // Foreground reconcile: re-assert the authoritative count even when the totals have not
    // changed. While backgrounded the native badge drifts away from the truth — iOS zeroes it on
    // becomeActive and both platforms increment it per push — so the effect above (which only fires
    // on a change) is not enough to correct it. Re-pushing here overwrites the drift and resets the
    // native increment base for the next background session.
    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) {
            refreshOtherClouds();
            pushBadge();
        }
    });

    return null;
};
