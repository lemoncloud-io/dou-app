import { useEffect } from 'react';

import { getSyncManager, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

/**
 * Registers a channel sync target for every channel in the active cloud, so the unread badge has a
 * fresh head for places the user is not currently looking at.
 *
 * Unread is `max(0, (channel.chatNo - channel.metaNo) - readNo)`: the head comes from the channel
 * record and the cursor from the join row. {@link useMyJoins} already registers the cursor side
 * cloud-wide; this is its counterpart for the head. Without it only the rendered rows (active
 * place) hold a live head, and every other place waits on the 60s cloud-wide delta.
 *
 * COST: the channel plan polls `channel.get` per target — it does not batch — so this adds one
 * request per cloud channel per interval on top of the join targets. `syncChannels` already covers
 * the whole cloud in a single request every 60s, so this buys freshness, not correctness. Scoped to
 * the home surface for the same reason `useMyJoins` is: registrations must die with the screen that
 * wants them, not ride along on an always-mounted layout.
 *
 * Registration refcounts by target key, so the per-row `useChannelSync` in ChannelList overlapping
 * these is harmless — whichever unmounts last releases the target.
 */
export const useCloudChannelSync = (channels: DomainChannel[]): void => {
    const { isVerified } = useRuntimeSocketState();

    // Stable id key so the effect only re-runs when the channel set actually changes, not on every
    // render's new array identity.
    const channelIds = channels.map(channel => channel.id);
    const channelKey = channelIds.join(',');

    useEffect(() => {
        if (!isVerified) return;
        const sync = getSyncManager();
        const disposers = channelIds.map(id => sync.registerChannel(id));
        return () => disposers.forEach(dispose => dispose());
        // channelKey captures the set; channelIds is read once per key.
         
    }, [channelKey, isVerified]);
};
