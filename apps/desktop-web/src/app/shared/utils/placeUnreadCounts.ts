import { isCloudWideChannel, type DomainChannel } from '@chatic/data';

import { computeChannelUnread } from './channelUnread';

/**
 * Unread messages per place for one cloud's channels, plus the total that the window title and OS
 * badge show.
 *
 * A group channel counts under its own place. A cloud 1:1 counts under every place that lists it
 * (`dmPlaces`, from `cloudDmPlaces` — passed in so a read, which moves only the cursors, does not
 * rebuild it), so the dot on a place matches its Direct messages section. That makes the
 * per-place numbers overlap, which is why the total is summed per channel rather than per place:
 * one unread 1:1 listed in two places is still one conversation to read.
 */
export const placeUnreadCounts = (
    channels: readonly DomainChannel[],
    {
        myUid,
        dmPlaces,
        readCursors,
    }: {
        myUid: string | null;
        dmPlaces: ReadonlyMap<string, readonly string[]>;
        readCursors: Record<string, number>;
    }
): { byPlace: Record<string, number>; total: number } => {
    const byPlace: Record<string, number> = {};
    let total = 0;
    for (const channel of channels) {
        const cloudWide = isCloudWideChannel(channel);
        // A room with no place was never counted; a 1:1 is placed by the rule instead of its stamp.
        if (!cloudWide && !channel.sid) continue;
        const places = cloudWide ? (dmPlaces.get(channel.id ?? '') ?? []) : [channel.sid ?? ''];
        // Read boundary: the channel's own `$join` (chatNo + the metaNo snapshot that nets
        // system messages out), with the local cursor clearing the badge on read.
        const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
        if (!unread) continue;
        total += unread;
        for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + unread;
    }
    return { byPlace, total };
};
