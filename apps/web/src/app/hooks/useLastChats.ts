import { useEffect, useMemo, useState } from 'react';

import {
    runtime,
    isInJoinWindow,
    type DomainChannel,
    type DomainChat,
    type DomainJoin,
    type DomainLastChat,
} from '@chatic/runtime-react';

export const useLastChats = (
    channels: DomainChannel[],
    joinByChannel?: Map<string, DomainJoin>
): Map<string, DomainChat> => useLastBy(channels, joinByChannel, previewOf);

export const useLastActivities = (
    channels: DomainChannel[],
    joinByChannel?: Map<string, DomainJoin>
): Map<string, DomainChat> => useLastBy(channels, joinByChannel, activityOf);

const previewOf = (row: DomainLastChat): DomainChat | null => row.chat;
const activityOf = (row: DomainLastChat): DomainChat | null => row.activity ?? row.chat;

const useLastBy = (
    channels: DomainChannel[],
    joinByChannel: Map<string, DomainJoin> | undefined,
    select: (row: DomainLastChat) => DomainChat | null
): Map<string, DomainChat> => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();

    const [lastByChannel, setLastByChannel] = useState<Map<string, DomainChat>>(new Map());

    const channelKey = useMemo(
        () =>
            channels
                .map(channel => channel.id)
                .filter(Boolean)
                .sort()
                .join(','),
        [channels]
    );

    useEffect(() => {
        if (!channelKey) {
            setLastByChannel(new Map());
            return;
        }
        const channelIds = channelKey.split(',');
        return chatRepository.observeLastList(channelIds, rows => {
            const nextLast = new Map<string, DomainChat>();
            for (const row of rows) {
                const chat = select(row);
                if (chat) nextLast.set(row.channelId, chat);
            }
            setLastByChannel(nextLast);
        });
    }, [chatRepository, channelKey, select]);

    return useMemo(() => {
        if (!joinByChannel?.size) return lastByChannel;
        const visible = new Map<string, DomainChat>();
        for (const [channelId, chat] of lastByChannel) {
            if (isInJoinWindow(chat, joinByChannel.get(channelId)?.joinedNo)) visible.set(channelId, chat);
        }
        return visible;
    }, [lastByChannel, joinByChannel]);
};
