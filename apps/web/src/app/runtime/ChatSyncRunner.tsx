import { useMemo } from 'react';

import { runtime } from '@chatic/runtime';

import { useCloudSelfChannels } from '../features/channels/hooks';
import { isSomeoneElsesSelfChat } from '../features/channels/utils/membership';
import { useSelectedCloudId } from '../hooks/useCloudScope';
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
 *
 * Somebody else's notes-to-self room is left out. A row like that is only ever left over from the
 * previous account — a guest→social promotion or an account switch swaps the uid while the cached
 * rows still hold the old account's room — and the server refuses its feed to anyone but the owner
 * (`403 not a member of channel`), so every head move on it would pull a page that can only fail.
 * The owner is compared with the uid this account has in the selected cloud — the one the
 * registration itself runs under — not the session's, which lags it during a cloud switch and would
 * read my own room in the new cloud as a stranger's.
 */
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
