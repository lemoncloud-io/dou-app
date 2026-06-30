import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { computeChannelUnread, resolveReadNo } from '../utils';
import { useReadCursorStore } from '../stores';
import { useChannelReadCursors } from './useChannelReadCursors';

// Fixed alphabetical order (Slack-style) so the list doesn't jump on every new
// message; unread is surfaced by the row badge, not by reordering.
const channelLabel = (channel: DomainChannel): string => (channel.name ?? channel.id ?? '').toLowerCase();

const sortByName = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)));

/**
 * Streams the channel list for a place from the engine's channel cache (mirrors
 * apps/web useHomeChannels). List discovery + per-channel realtime sync are owned
 * globally by the runtime (useBackgroundSync / the sync layer), so this hook only
 * observes the cache: a new message, an invite, or a read updates the cached
 * channel record and re-emits here, keeping unread badges fresh without a manual
 * refetch. The relay cache is not sid-isolated, so results are filtered to the
 * active place and the list is reset on place switch so the previous place's
 * channels don't flash.
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { userId: myUid } = useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const [rawChannels, setRawChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Render-phase reset on place switch (mirrors apps/web useChannels): drop the
    // old list immediately rather than waiting for the next emit to resolve.
    const [prevPlaceId, setPrevPlaceId] = useState(placeId);
    if (placeId !== prevPlaceId) {
        setPrevPlaceId(placeId);
        setRawChannels([]);
        setIsLoading(true);
    }

    useEffect(() => {
        if (!placeId) {
            setRawChannels([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        return channelRepository.observeList({ sid: placeId }, result => {
            const list = (result?.list ?? []).filter(c => c.sid === placeId);
            setRawChannels(sortByName(list));
            setIsLoading(false);
        });
    }, [channelRepository, placeId]);

    // Read boundary from my synced+observed join row, with the local cursor layered on so reading
    // clears the badge instantly. Server `unreadCount` is not trusted (it lags and never clears).
    const serverReadNo = useChannelReadCursors(rawChannels);
    const channels = useMemo(
        () =>
            rawChannels.map(c => ({
                ...c,
                unreadCount: computeChannelUnread(
                    c,
                    myUid ?? null,
                    resolveReadNo(c.id ?? '', serverReadNo, readCursors)
                ),
            })),
        [rawChannels, myUid, readCursors, serverReadNo]
    );

    return { channels, isLoading };
};
