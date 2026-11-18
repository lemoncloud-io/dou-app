import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { runtime } from '@chatic/runtime';
import type { DomainChannel } from '@chatic/data';

import { isRoomOwner } from '../lib/channelStereoPolicy';
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
    // My own join (`$join`) carries my role here; a 1:1 and a self chat have no owner — see isRoomOwner.
    isOwner: isRoomOwner(channel, channel.$join, myUid),
    isSelfChat: channel.stereo === 'self',
    memberCount: channel.memberIds?.length ?? channel.memberNo ?? 0,
});

/**
 * How long to wait for a channel that is not in the cache yet before calling it unresolvable.
 *
 * `observeItem` answers the FIRST time from the cache alone, so a channel the device has never seen —
 * a push into a new room, or the first visit after a cloud switch — answers `null` immediately while
 * `runtime.sync.useChannelSync` is still fetching it. Matches the socket-wait bound used elsewhere (see
 * `usePushNavigate`, and the phone login's session switch).
 */
const CHANNEL_RESOLVE_TIMEOUT_MS = 10_000;

/**
 * Observe a single channel's metadata. Registers channel sync so the engine
 * keeps it fresh (`runtime.sync.useChannelSync` + `observeItem`), then maps
 * the domain model into the room/settings view-model.
 *
 * **A missing row is not the same as a resolved absence.** `observeItem` notifies straight away with
 * whatever the local cache holds, and `cacheRead` returns `null` on a miss — so treating that first
 * `null` as an answer told callers "this channel does not exist" while the fetch was still in flight.
 * `ChannelRoomPage` acted on it by redirecting home, which unmounted `runtime.sync.useChannelSync` and cancelled
 * the very fetch that would have cached the row: the room then bounced forever, and a push into it
 * could never be opened. So a `null` before any row has arrived keeps `isLoading` true, and only a
 * bounded wait turns it into `isError`.
 *
 * A `null` AFTER a row has been seen is a real removal (leaving the channel, a cache clear) and
 * resolves immediately — callers still need to leave the screen in that case.
 *
 * `seed` (ADR-0058): the row the navigating screen already had (a home list row, passed through
 * navigation state). Display-only — it renders the room instantly and disarms the resolve timeout
 * (a seeded room shows content, never the error screen the timeout exists for), but it does NOT
 * touch the resolution semantics above: `hasResolvedRef` stays observer-owned, so a cold cache's
 * initial `null` is still "fetch in flight", not a removal bounce. Ignored unless its id matches.
 */
export const useChannel = (channelId: string | null, options?: { seed?: DomainChannel | null }) => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();
    const myUid = userId ?? '';

    const seed = options?.seed && channelId && options.seed.id === channelId ? options.seed : null;

    const [channel, setChannel] = useState<DomainChannel | null>(null);
    const [isLoading, setIsLoading] = useState(!!channelId);
    const [isError, setIsError] = useState(false);
    /**
     * The channelId the three states above were last reset for.
     *
     * The effect below resets them when the id changes, but an effect runs after the render that
     * carries the new id. In that render the states still describe the PREVIOUS room, so a screen
     * that stays mounted across a room-to-room move (a push toast, a search jump) read the old
     * channel under the new id: the room registered `<new channelId>@<old member>` join targets,
     * each one 404'd, and the sync engine logged it as a removal. Comparing against this id lets
     * that render answer for the room it was asked about instead.
     */
    const [stateFor, setStateFor] = useState(channelId);
    const isStale = stateFor !== channelId;
    /** Whether a row has ever arrived for the CURRENT channelId — tells a miss from a removal. */
    const hasResolvedRef = useRef(false);
    /** Read inside the timeout without re-arming the effect when only the seed identity changes. */
    const hasSeedRef = useRef(!!seed);
    hasSeedRef.current = !!seed;

    // Keep the channel row synced for as long as the hook is mounted.
    runtime.sync.useChannelSync(channelId ?? undefined);

    useEffect(() => {
        hasResolvedRef.current = false;
        setStateFor(channelId);
        setIsError(false);
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }
        setChannel(null);
        setIsLoading(true);

        // Give up waiting eventually: a channel the user has no access to (or one that really is
        // gone) would otherwise hold the screen in a permanent loading state. With a seed there is
        // content on screen, so expiry keeps showing it instead of trading it for an error page.
        const timer = setTimeout(() => {
            if (hasResolvedRef.current || hasSeedRef.current) return;
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

    /**
     * Did the server refuse this channel outright?
     *
     * The timeout above cannot tell a refusal from a slow fetch, so it waits out the full window
     * and then calls both an error. The sync layer knows the difference on the first poll — the
     * scheduler classifies a 403/404 as `gone` — and records it (see `runtime.sync`). Reading it
     * here turns the most common case of that timeout, a stale notification into a room this
     * device is not in, into an immediate and accurate answer.
     *
     * Deliberately NOT folded into `isError`. It is a different fact with a different sentence:
     * "you are not in this conversation" is something we know, and "could not load" is what we say
     * when we do not. A caller that does not care can keep reading `isError` alone.
     */
    const isRefused = useSyncExternalStore(
        runtime.sync.subscribeRefusedChannels,
        () => (channelId ? runtime.sync.isChannelRefused(channelId) : false),
        () => false
    );

    // The observer's answer always wins; the seed only fills the gap until it lands. A resolved
    // REMOVAL must still win over the seed, so the fallback applies only while unresolved.
    // While stale, nothing has resolved for THIS id yet: no row, no removal, no error — the same
    // answer the first render of a fresh mount gives.
    const hasResolved = !isStale && hasResolvedRef.current;
    const effective = (isStale ? null : channel) ?? (!hasResolved ? seed : null);
    const clientChannel = useMemo(() => (effective ? toClientChannel(effective, myUid) : null), [effective, myUid]);

    // A refusal only speaks while there is nothing to show. A cached row that the server has since
    // stopped serving is a different situation — the screen has content, and the removal path owns
    // what happens to it.
    const isForbidden = isRefused && !effective;
    const loading = isStale ? !!channelId : isLoading;

    return {
        channel: clientChannel,
        isLoading: loading && !seed && !isForbidden,
        isError: !isStale && isError,
        isForbidden,
    };
};
