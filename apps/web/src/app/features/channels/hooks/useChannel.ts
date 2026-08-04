import { useEffect, useMemo, useRef, useState } from 'react';

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
 * How long to wait for a channel that is not in the cache yet before calling it unresolvable.
 *
 * `observeItem` answers the FIRST time from the cache alone, so a channel the device has never seen —
 * a push into a new room, or the first visit after a cloud switch — answers `null` immediately while
 * `useChannelSync` is still fetching it. Matches the socket-wait bound used elsewhere (see
 * `usePushNavigate`, `applySessionToken`).
 */
const CHANNEL_RESOLVE_TIMEOUT_MS = 10_000;

/**
 * Observe a single channel's metadata. Registers channel sync so the engine
 * keeps it fresh (mirrors testbed's `useChannelSync` + `observeItem`), then maps
 * the domain model into the room/settings view-model.
 *
 * **A missing row is not the same as a resolved absence.** `observeItem` notifies straight away with
 * whatever the local cache holds, and `cacheRead` returns `null` on a miss — so treating that first
 * `null` as an answer told callers "this channel does not exist" while the fetch was still in flight.
 * `ChannelRoomPage` acted on it by redirecting home, which unmounted `useChannelSync` and cancelled
 * the very fetch that would have cached the row: the room then bounced forever, and a push into it
 * could never be opened. So a `null` before any row has arrived keeps `isLoading` true, and only a
 * bounded wait turns it into `isError`.
 *
 * A `null` AFTER a row has been seen is a real removal (leaving the channel, a cache clear) and
 * resolves immediately — callers still need to leave the screen in that case.
 */
export const useChannel = (channelId: string | null) => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const myUid = userId ?? '';

    const [channel, setChannel] = useState<DomainChannel | null>(null);
    const [isLoading, setIsLoading] = useState(!!channelId);
    const [isError, setIsError] = useState(false);
    /** Whether a row has ever arrived for the CURRENT channelId — tells a miss from a removal. */
    const hasResolvedRef = useRef(false);

    // Keep the channel row synced for as long as the hook is mounted.
    useChannelSync(channelId ?? undefined);

    useEffect(() => {
        hasResolvedRef.current = false;
        setIsError(false);
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }
        setChannel(null);
        setIsLoading(true);

        // Give up waiting eventually: a channel the user has no access to (or one that really is
        // gone) would otherwise hold the screen in a permanent loading state.
        const timer = setTimeout(() => {
            if (hasResolvedRef.current) return;
            setIsLoading(false);
            setIsError(true);
        }, CHANNEL_RESOLVE_TIMEOUT_MS);

        const unsubscribe = channelRepository.observeItem(channelId, item => {
            if (item) {
                hasResolvedRef.current = true;
                setChannel(item);
                setIsLoading(false);
                setIsError(false);
                return;
            }
            // Only a row we once had can go missing for real; before that, the fetch is still coming.
            if (hasResolvedRef.current) {
                setChannel(null);
                setIsLoading(false);
            }
        });

        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
    }, [channelRepository, channelId]);

    const clientChannel = useMemo(() => (channel ? toClientChannel(channel, myUid) : null), [channel, myUid]);

    return { channel: clientChannel, isLoading, isError };
};
