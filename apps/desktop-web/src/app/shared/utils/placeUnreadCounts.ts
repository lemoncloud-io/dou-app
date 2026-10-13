import { isCloudWideChannel, type DomainChannel } from '@chatic/data';

import { channelNotifyMode, isNotifyDm, type ChannelNotifyPrefs } from '../stores/useNotificationPrefsStore';
import { computeChannelUnread } from './channelUnread';
import { listingPlaces } from './cloudDmPlaces';

/**
 * Unread messages per place for one cloud's channels, plus the total that the window title and OS
 * badge show.
 *
 * A group channel counts under its own place. A cloud 1:1 counts under every place that lists it
 * (`dmPlaces`, from `cloudDmPlaces` — passed in so a read, which moves only the cursors, does not
 * rebuild it), so the dot on a place matches its Direct messages section. That makes the
 * per-place numbers overlap, which is why the total is summed per channel rather than per place:
 * one unread 1:1 listed in two places is still one conversation to read.
 *
 * A channel on any notify mode but "all" counts nowhere here. Its own row still shows its unread,
 * but a place or cloud dot says "something here wants you", and a channel told to stay quiet does
 * not. A mention there is still captured into the Mentions entry while the app is running, whatever
 * the mode; one that arrived while it was closed lights nothing here.
 */
export const placeUnreadCounts = (
    channels: readonly DomainChannel[],
    {
        myUid,
        dmPlaces,
        readCursors,
        notifyPrefs,
    }: {
        myUid: string | null;
        dmPlaces: ReadonlyMap<string, readonly string[]>;
        readCursors: Record<string, number>;
        notifyPrefs: ChannelNotifyPrefs;
    }
): { byPlace: Record<string, number>; total: number } => {
    const byPlace: Record<string, number> = {};
    let total = 0;
    for (const channel of channels) {
        // A room with no place was never counted; a 1:1 is placed by the rule instead of its stamp.
        const places = listingPlaces(channel, dmPlaces);
        if (!isCloudWideChannel(channel) && places.length === 0) continue;
        const mode = channelNotifyMode(notifyPrefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel));
        if (mode !== 'all') continue;
        // Read boundary: the channel's own `$join` (chatNo + the metaNo snapshot that nets
        // system messages out), with the local cursor clearing the badge on read.
        const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
        if (!unread) continue;
        total += unread;
        for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + unread;
    }
    return { byPlace, total };
};
