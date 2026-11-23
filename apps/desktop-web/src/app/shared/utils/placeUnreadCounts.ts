import { isCloudDm, RELAY_CLOUD_ID, type DomainChannel } from '@chatic/runtime';

import { channelNotifyMode, isNotifyDm, type ChannelNotifyPrefs } from '../stores/useNotificationPrefsStore';
import type { MentionItem } from '../stores/useMentionsStore';
import { channelReadNo, computeChannelUnread } from './channelUnread';
import { isMentionKind } from './inboxKinds';
import { listingPlaces } from './roomPlaces';

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
        listsUnplacedDms?: boolean;
    }
): { byPlace: Record<string, number>; total: number } => {
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
            const key = `${item.cloudId}|${item.placeId}|${item.channelId}`;
            const bucket = mentionChatNos.get(key);
            const chatNo = item.chatNo ?? 0;
            if (bucket) bucket.push(chatNo);
            else mentionChatNos.set(key, [chatNo]);
        }
    }
    const byPlace: Record<string, number> = {};
    let total = 0;
    for (const channel of channels) {
        const places = listingPlaces(channel, filedPlaces);
        if (places.length === 0 && !(listsUnplacedDms && isCloudDm(channel))) continue;
        const mode = channelNotifyMode(notifyPrefs, channel.id ?? '', channel.$join?.notify, isNotifyDm(channel));
        if (mode === 'none') continue;
        if (mode === 'mention') {
            const readNo = channelReadNo(channel, readCursors[channel.id ?? ''] ?? 0);
            const chatNos = mentionChatNos.get(`${channel.cid || RELAY_CLOUD_ID}|${channel.sid}|${channel.id}`) ?? [];
            const unreadMentions = chatNos.reduce((count, chatNo) => (chatNo > readNo ? count + 1 : count), 0);
            if (!unreadMentions) continue;
            const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
            const add = Math.min(unreadMentions, unread);
            if (!add) continue;
            total += add;
            for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + add;
            continue;
        }
        const unread = computeChannelUnread(channel, myUid, readCursors[channel.id ?? '']);
        if (!unread) continue;
        total += unread;
        for (const placeId of places) byPlace[placeId] = (byPlace[placeId] ?? 0) + unread;
    }
    return { byPlace, total };
};
