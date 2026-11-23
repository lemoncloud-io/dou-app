import { useMemo } from 'react';

import { runtime } from '@chatic/runtime';

import { useCloudSelfChannels } from '../features/channels/hooks';
import { isSomeoneElsesSelfChat } from '../features/channels/utils/membership';
import { useSelectedCloudId } from '../hooks/useCloudScope';
import { useChatSyncRegistration } from '../hooks/useChatSyncRegistration';
import { useHomeChannels } from '../hooks/useHomeChannels';

export const ChatSyncRunner = (): null => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useUidInCloud(useSelectedCloudId());
    const { channels: placeChannels } = useHomeChannels(selectedSiteId);
    const { channels: selfChannels } = useCloudSelfChannels();
    const channels = useMemo(() => {
        const placeIds = new Set(placeChannels.map(channel => channel.id));
        return [...placeChannels, ...selfChannels.filter(channel => !placeIds.has(channel.id))].filter(
            channel => !isSomeoneElsesSelfChat(channel, uid)
        );
    }, [placeChannels, selfChannels, uid]);
    useChatSyncRegistration(channels);
    return null;
};
