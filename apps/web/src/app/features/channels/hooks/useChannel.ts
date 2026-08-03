import { useEffect, useMemo, useState } from 'react';

import { useChannelSync, useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChannel } from '@chatic/data';

import type { ClientChannelView } from '../types';

/**
 * Map a cached channel into the UI view-model with derived membership flags.
 *
 * Deliberately carries NO display name: the title depends on `stereo` and on data this hook does not
 * have (my join nick, the DM peer's profile), so it is resolved by `resolveChannelTitle` —
 * one chain shared by the home list, the room, settings and channel management (ADR-0039).
 */
const toClientChannel = (channel: DomainChannel, myUid: string): ClientChannelView => ({
    ...channel,
    isOwner: !!channel.ownerId && channel.ownerId === myUid,
    isSelfChat: channel.stereo === 'self',
    memberCount: channel.memberIds?.length ?? channel.memberNo ?? 0,
});

/**
 * Observe a single channel's metadata. Registers channel sync so the engine
 * keeps it fresh (mirrors testbed's `useChannelSync` + `observeItem`), then maps
 * the domain model into the room/settings view-model.
 */
export const useChannel = (channelId: string | null) => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const myUid = userId ?? '';

    const [channel, setChannel] = useState<DomainChannel | null>(null);
    const [isLoading, setIsLoading] = useState(!!channelId);

    // Keep the channel row synced for as long as the hook is mounted.
    useChannelSync(channelId ?? undefined);

    useEffect(() => {
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        return channelRepository.observeItem(channelId, item => {
            setChannel(item);
            setIsLoading(false);
        });
    }, [channelRepository, channelId]);

    const clientChannel = useMemo(() => (channel ? toClientChannel(channel, myUid) : null), [channel, myUid]);

    return { channel: clientChannel, isLoading, isError: false };
};
