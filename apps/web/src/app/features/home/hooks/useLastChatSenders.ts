import { useMemo } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { useChannelProfiles } from '../../channels/hooks/useChannelProfiles';
import { LIST_PROFILE_SYNC_INTERVAL_MS } from '../../channels/hooks/useDmPeers';
import { channelKindOf } from '../../channels/lib';
import { isRawIdNick } from '../../channels/utils/nick';

/** A candidate is usable when it survives trimming and is not a server-seeded raw id. */
const asName = (value: string | undefined, id: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed || isRawIdNick(trimmed, id)) return undefined;
    return trimmed;
};

/**
 * Who wrote each group room's last message, for the home row's "sender : message" line.
 *
 * Named the way the room names a message's author, minus the room-only member cache: this place's
 * profile nick first, then the name the chat row carries from when it was written. The member
 * cache costs a `syncChannelUsers` call per room, which a list cannot afford — so a name the room
 * finds there and the list does not is left out here, and the row prints the message alone rather
 * than a label like "Unknown user". My own messages carry my name, the same as anyone's.
 *
 * Every sender in the list is read through ONE `useChannelProfiles` subscription, the same way
 * `useDmPeers` names 1:1 peers, so rendering the list never asks per row. 1:1 and self-chat rows
 * are not read: their line has no sender.
 *
 * Returns `channelId -> name` for the group rows whose sender resolved.
 */
export const useLastChatSenders = (
    sid: string | null,
    channels: DomainChannel[],
    lastChats: Map<string, DomainChat>
): Map<string, string> => {
    const senderByChannel = useMemo(() => {
        const map = new Map<string, DomainChat>();
        for (const channel of channels) {
            if (channelKindOf(channel.stereo) !== 'group') continue;
            const chat = lastChats.get(channel.id);
            if (chat) map.set(channel.id, chat);
        }
        return map;
    }, [channels, lastChats]);

    // Sorted and deduped, because `useChannelProfiles` keys its registration on the joined ids: a
    // list re-ordered by a new message would otherwise dispose and re-register every target.
    const senderIds = useMemo(
        () =>
            [
                ...new Set([...senderByChannel.values()].map(chat => chat.ownerId).filter((id): id is string => !!id)),
            ].sort(),
        [senderByChannel]
    );

    const { profileMap } = useChannelProfiles(sid, senderIds, LIST_PROFILE_SYNC_INTERVAL_MS);

    return useMemo(() => {
        const map = new Map<string, string>();
        for (const [channelId, chat] of senderByChannel) {
            const id = chat.ownerId ?? '';
            const name = asName(profileMap.get(id)?.nick, id) ?? asName(chat.owner$?.name, id);
            if (name) map.set(channelId, name);
        }
        return map;
    }, [senderByChannel, profileMap]);
};
