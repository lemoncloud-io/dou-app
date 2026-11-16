import { useEffect, useMemo, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { ACCOUNT_CHANNEL_SID, RELAY_CLOUD_ID, isInPlaceList, isRelayDm, type DomainChannel } from '@chatic/data';

import { useActiveCloudData } from '../../../hooks/activeCloudDataContext';

/** A room's newest message, as its channel record carries it. */
export type ChannelLastChat = NonNullable<DomainChannel['lastChat$']>;

export interface PlaceChatFeed {
    cloudId: string;
    /** The place the room is filed under; absent for a room that belongs to no single place. */
    placeId?: string;
    channel: DomainChannel;
    /** The room's newest message, taken from its channel record when that record moved ahead. */
    chat: ChannelLastChat;
}

const topChatNoOf = (channel: DomainChannel): number => channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;

/**
 * Where a room is filed for the inbox. A relay 1:1 is one room per pair whatever place it carries,
 * and the account's own rooms carry a stand-in place, so neither names a place.
 */
const placeOf = (channel: DomainChannel): string | undefined =>
    !channel.sid || channel.sid === ACCOUNT_CHANNEL_SID || isRelayDm(channel) ? undefined : channel.sid;

/**
 * Hands `onChat` each room's newest message as it arrives, for the rooms of the CURRENT cloud's
 * CURRENT place.
 *
 * Message content streams only for the room on screen, so a message in any other room is seen
 * through its channel record: the record's `lastChat$` moving ahead means a new message arrived,
 * and that newest message is what is handed over. A burst collapses to its last message, and a
 * room's first record seen is a baseline, not news — nothing is handed over for what was already
 * there when the feed started.
 *
 * Each room's channel sync is registered while it is in scope, so its record stays live wherever
 * the reader is in the app, not only while home's rows are mounted. The registration is the same
 * one home's rows make, and the sync engine merges the two.
 *
 * The rooms come from the app's one shared channel observation; the reader's own notes room is left
 * out, since nothing in it is anyone else's.
 */
export const useCurrentPlaceChatFeed = (onChat: (feed: PlaceChatFeed) => void): void => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId || RELAY_CLOUD_ID;
    const isVerified = runtime.connection.useCloudVerified(cloudId);
    // A target only runs while the uid it was tagged with is still the account's uid in its cloud,
    // so an account change retires it — re-register on it.
    const uid = runtime.session.useUidInCloud(cloudId);
    const { channels } = useActiveCloudData();

    const scoped = useMemo(
        () =>
            selectedSiteId
                ? channels.filter(
                      channel =>
                          !!channel.id &&
                          channel.cid === cloudId &&
                          channel.stereo !== 'self' &&
                          isInPlaceList(channel, selectedSiteId)
                  )
                : [],
        [channels, cloudId, selectedSiteId]
    );

    // Read at emit time through a ref, so an unstable callback does not re-run the effects.
    const onChatRef = useRef(onChat);
    onChatRef.current = onChat;

    // Newest chatNo already seen, per cloud and room. Kept across a place switch: a room that comes
    // back into scope hands over the newest message it gained meanwhile, rather than taking it as a
    // new baseline.
    const seen = useRef(new Map<string, number>());

    useEffect(() => {
        for (const channel of scoped) {
            const top = topChatNoOf(channel);
            if (top <= 0) continue;
            const key = `${cloudId}:${channel.id}`;
            const previous = seen.current.get(key);
            // Never step back on a stale or partial record.
            if (previous !== undefined && top <= previous) continue;
            seen.current.set(key, top);
            if (previous === undefined || !channel.lastChat$) continue;
            onChatRef.current({ cloudId, placeId: placeOf(channel), channel, chat: channel.lastChat$ });
        }
    }, [scoped, cloudId]);

    // Sorted so a reorder does not re-register.
    const channelKey = scoped
        .map(channel => channel.id)
        .sort()
        .join(',');

    useEffect(() => {
        if (!isVerified || !channelKey) return;
        const disposers = channelKey
            .split(',')
            .map(id => runtime.sync.registerSyncTarget({ type: 'channel', id }, { cid: cloudId }));
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, cloudId, isVerified, uid]);
};
