import { useMemo } from 'react';

import { runtime } from '@chatic/app-runtime';

import { useCloudSelfChannels } from '../features/channels/hooks';
import { useChatSyncRegistration } from '../hooks/useChatSyncRegistration';
import { useHomeChannels } from '../hooks/useHomeChannels';

/**
 * Keeps the messages of the session's place flowing into the chat cache on every route. Renders
 * nothing; mounted once under AppRuntime, inside the shared active-cloud observation.
 *
 * It used to run from the home page alone, which unmounts when the reader navigates away, so a
 * message in another room that arrived while a room or another tab was open never reached the cache
 * until home came back.
 *
 * The rooms are the ones home lists: the place's own, plus the cloud's notes-to-self room. That room
 * belongs to the account rather than to a place, so the place slice holds it only in the place it
 * was tagged with; home reads it separately, and so does this.
 */
export const ChatSyncRunner = (): null => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { channels: placeChannels } = useHomeChannels(selectedSiteId);
    const { channels: selfChannels } = useCloudSelfChannels();
    const channels = useMemo(() => {
        const placeIds = new Set(placeChannels.map(channel => channel.id));
        return [...placeChannels, ...selfChannels.filter(channel => !placeIds.has(channel.id))];
    }, [placeChannels, selfChannels]);
    useChatSyncRegistration(channels);
    return null;
};
