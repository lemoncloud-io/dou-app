import { useMemo } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/runtime';

import { useChannelProfiles } from '../../channels/hooks/useChannelProfiles';
import { LIST_PROFILE_SYNC_INTERVAL_MS } from '../../channels/hooks/useDmPeers';
import { channelKindOf } from '../../channels/lib';
import { isRawIdNick } from '../../channels/utils/nick';

const asName = (value: string | undefined, id: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed || isRawIdNick(trimmed, id)) return undefined;
    return trimmed;
};

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
