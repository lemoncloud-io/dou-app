import { useCallback, useEffect } from 'react';

import { useSessionSelection } from '@chatic/web-core';

import { appBridge } from '../../bridge/appBridge';
import { useOnBackgroundStatusChanged } from '../../bridge/useHandleAppMessage';
import { useActiveCloudChannels, useChannelUnreads, useMyJoins } from './hooks';
import { sumSnapshot, writeCloudUnread } from './lib';

/**
 * App-global unread badge. Mounted once under AppRuntime (not the home page) so the native
 * app-icon badge stays correct on every route.
 *
 * Observes the active cloud's full channel list, write-throughs its total into the per-cloud
 * snapshot, and pushes the cross-cloud sum to the native badge. Inactive clouds keep their
 * last-visited total in the snapshot, so the badge reflects unread across every visited cloud
 * (best-effort). Read cursors come from the subscribed join list (useMyJoins registers a join sync
 * per channel); channel metadata freshness rides useBackgroundSync's cloud-wide syncChannels delta.
 */
export const UnreadBadgeRunner = (): null => {
    const cloudChannels = useActiveCloudChannels();
    // Observe-only (sync: false): the app-global badge must not own per-channel join sync — that
    // registration is scoped to the home surface so it tears down when home unmounts. The cursor
    // still reflects my reads (join cache) and new messages (channel head via syncChannels), and
    // reconciles on the next home visit.
    const { total } = useChannelUnreads(cloudChannels, useMyJoins(cloudChannels, { sync: false }));
    const { selectedCloudId } = useSessionSelection();

    // Write-through the active cloud's total into the snapshot, then push the cross-cloud sum to
    // the native badge.
    const pushBadge = useCallback(() => {
        const snapshot = writeCloudUnread(selectedCloudId, total);
        appBridge.setBadgeCount(sumSnapshot(snapshot));
    }, [selectedCloudId, total]);

    useEffect(() => {
        pushBadge();
    }, [pushBadge]);

    // Foreground reconcile: re-assert the authoritative count even when `total` has not changed.
    // While backgrounded the native badge drifts away from the truth — iOS zeroes it on becomeActive
    // and both platforms increment it per push — so the effect above (which only fires on a `total`
    // change) is not enough to correct it. Re-pushing here overwrites the drift and resets the
    // native increment base for the next background session.
    useOnBackgroundStatusChanged(message => {
        if (message.data.isForeground) pushBadge();
    });

    return null;
};
