import { useEffect } from 'react';

import { useSessionSelection } from '@chatic/web-core';

import { appBridge } from '../../bridge/appBridge';
import { useActiveCloudChannels, useChannelUnreads } from './hooks';
import { sumSnapshot, writeCloudUnread } from './lib';

/**
 * App-global unread badge. Mounted once under AppRuntime (not the home page) so the native
 * app-icon badge stays correct on every route.
 *
 * Observes the active cloud's full channel list, write-throughs its total into the per-cloud
 * snapshot, and pushes the cross-cloud sum to the native badge. Inactive clouds keep their
 * last-visited total in the snapshot, so the badge reflects unread across every visited cloud
 * (best-effort). Cache observe only — no per-channel realtime registration; freshness rides
 * useBackgroundSync's periodic cloud-wide syncChannels delta.
 */
export const UnreadBadgeRunner = (): null => {
    const cloudChannels = useActiveCloudChannels();
    const { total } = useChannelUnreads(cloudChannels);
    const { selectedCloudId } = useSessionSelection();

    useEffect(() => {
        const snapshot = writeCloudUnread(selectedCloudId, total);
        appBridge.setBadgeCount(sumSnapshot(snapshot));
    }, [selectedCloudId, total]);

    return null;
};
