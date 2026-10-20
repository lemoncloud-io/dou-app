import { isCloudDm, type DomainChannel } from '@chatic/data';

import { channelNotifyMode, isNotifyDm, type ChannelNotifyPrefs } from '../stores/useNotificationPrefsStore';
import type { MentionItem } from '../stores/useMentionsStore';
import { channelReadNo, computeChannelUnread } from './channelUnread';
import { isMentionKind } from './inboxKinds';
import { listingPlaces } from './roomPlaces';

/**
 * Unread messages per place for one cloud's channels, plus the total that the window title and OS
 * badge show.
 *
 * Every channel counts under the place that lists it — a group channel and a cloud 1:1 alike, their
 * own place — so the dot on a place matches its sidebar. My notes-to-self room is the exception: it
 * counts under every place it is filed under (`filedPlaces`, from `roomPlaces` — passed in so a read,
 * which moves only the cursors, does not rebuild it). That makes the per-place numbers overlap,
 * which is why the total is summed per channel rather than per place: one unread room listed in two
 * places is still one conversation to read. A cloud 1:1 that names no place counts in the total
 * only, and only when the sidebar lists it — in a cloud known to have no place (`listsUnplacedDms`);
 * anywhere else no row could clear it.
 *
 * A channel on "off" counts nowhere here. A channel on "mentions only" counts its
 * unread mentions, capped at its unread messages — the quiet chatter around them
 * stays out, and a mention read on another device (whose channel unread is back
 * to 0) stops counting here too. Its own row still shows its full unread, but a
 * place or cloud dot says "something here wants you", and a channel told to
 * stay quiet otherwise does not. A mention there is still captured into the
 * Mentions entry while the app is running, whatever the mode; one that arrived
 * while it was closed lights nothing here.
 */
export const placeUnreadCounts = (
    channels: readonly DomainChannel[],
    {
        myUid,
        filedPlaces,
        readCursors,
        notifyPrefs,
        mentions,
        listsUnplacedDms = false,
    }: {
        myUid: string | null;
        filedPlaces: ReadonlyMap<string, readonly string[]>;
        readCursors: Record<string, number>;
        notifyPrefs: ChannelNotifyPrefs;
        mentions?: Record<string, MentionItem>;
        /** Whether the sidebar lists the cloud 1:1s no place holds: the cloud has no place at all. */
        listsUnplacedDms?: boolean;
    }
): { byPlace: Record<string, number>; total: number } => {
    // One pass over the inbox per call, keyed `place|channel`: per-channel
    // filtering then reads the bucket instead of re-scanning all 200 entries.
    // Built only when a mentions-only channel is actually in the list.
    const mentionChatNos = new Map<string, number[]>();
    if (
        mentions &&
        channels.some(
            channel =>
                channelNotifyMode(notifyPrefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel)) ===
                'mention'
        )
    ) {
        for (const item of Object.values(mentions)) {
            if (item.readAt || item.placeId === undefined || !isMentionKind(item)) continue;
            const key = `${item.placeId}|${item.channelId}`;
            const bucket = mentionChatNos.get(key);
            const chatNo = item.chatNo ?? 0;
            if (bucket) bucket.push(chatNo);
            else mentionChatNos.set(key, [chatNo]);
        }
    }
    const byPlace: Record<string, number> = {};
    let total = 0;
    for (const channel of channels) {
        // A room with no place is not counted, except a cloud 1:1 where a cloud with no place lists it.
        const places = listingPlaces(channel, filedPlaces);
        if (places.length === 0 && !(listsUnplacedDms && isCloudDm(channel))) continue;
        const mode = channelNotifyMode(notifyPrefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel));
        if (mode === 'none') continue;
        if (mode === 'mention') {
            // A 1:1 never reads as mentions-only (`channelNotifyMode`), so this is a
            // group channel: one place at most, counted once in the total.
            const readNo = channelReadNo(channel, readCursors[channel.id ?? ''] ?? 0);
            const chatNos = mentionChatNos.get(`${channel.sid}|${channel.id}`) ?? [];
            const unreadMentions = chatNos.reduce((count, chatNo) => (chatNo > readNo ? count + 1 : count), 0);
            if (!unreadMentions) continue;
            // The cap is what the row's `@` does not do: a mention read elsewhere
            // (channel unread back to 0) leaves no number behind.
            const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
            const add = Math.min(unreadMentions, unread);
            if (!add) continue;
            total += add;
            for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + add;
            continue;
        }
        // Read boundary: the channel's own `$join` (chatNo + the metaNo snapshot that nets
        // system messages out), with the local cursor clearing the badge on read.
        const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
        if (!unread) continue;
        total += unread;
        for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + unread;
    }
    return { byPlace, total };
};
