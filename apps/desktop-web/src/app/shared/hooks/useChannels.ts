import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { computeChannelUnread, resolveReadNo } from '../utils';
import { useReadCursorStore } from '../stores';
import { useChannelReadCursors } from './useChannelReadCursors';

// Fixed alphabetical order (Slack-style) so the list doesn't jump on every new
// message; unread is surfaced by the row badge, not by reordering.
const channelLabel = (channel: DomainChannel): string => (channel.name ?? channel.id ?? '').toLowerCase();

const sortByName = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)));

// How long a verified socket may report an empty list before we trust it as truly
// empty — covers list discovery's round trip so the empty state never flashes first.
const EMPTY_SETTLE_MS = 600;
// Hard ceiling for an UNVERIFIED socket. After a sleep/wake wedge the socket can sit
// unverified indefinitely (the cloud-token refresh 400s and never re-verifies), which
// must never pin the skeleton forever — observeList already streams the cache without
// the socket, so once this elapses we trust the cached-or-empty list instead.
const EMPTY_WEDGE_CEILING_MS = 4000;

/**
 * Streams the channel list for a place from the engine's channel cache (mirrors
 * apps/web useHomeChannels). List discovery + per-channel realtime sync are owned
 * globally by the runtime (useBackgroundSync / the sync layer), so this hook only
 * observes the cache: a new message, an invite, or a read updates the cached
 * channel record and re-emits here, keeping unread badges fresh without a manual
 * refetch. The relay cache is not sid-isolated, so results are filtered to the
 * active place and the list is reset on place switch so the previous place's
 * channels don't flash.
 *
 * `uid` is part of the cache observer's scope key ({cid, sid, uid}) and flips only at
 * cloud-switch commit, after the optimistic `cid` pre-apply. sid alone cannot key the
 * subscription: sids are per-cloud, so a cross-cloud switch can reuse a numerically
 * equal one (a cloud's site '10001' and the relay's site '10001'), leaving the observer
 * bound to the previous cloud's partition and streaming its channels forever. Re-key on
 * uid too. Mirrors apps/web useHomeChannels (57a58278).
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { userId: myUid } = useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const { isVerified } = useSocketState();
    const [rawChannels, setRawChannels] = useState<DomainChannel[]>([]);
    const [rawLoading, setRawLoading] = useState(true);

    // Render-phase reset on scope switch: drop the old list immediately rather than waiting
    // for the next emit to resolve. Keyed on uid as well as placeId — a cross-cloud switch
    // can land on an equal sid, and only uid tells the two partitions apart.
    const scopeKey = `${myUid ?? ''}:${placeId ?? ''}`;
    const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
    if (scopeKey !== prevScopeKey) {
        setPrevScopeKey(scopeKey);
        setRawChannels([]);
        setRawLoading(true);
    }

    useEffect(() => {
        if (!placeId) {
            setRawChannels([]);
            setRawLoading(false);
            return;
        }
        setRawLoading(true);
        return channelRepository.observeList({ sid: placeId }, result => {
            const list = (result?.list ?? []).filter(c => c.sid === placeId);
            setRawChannels(sortByName(list));
            setRawLoading(false);
        });
    }, [channelRepository, placeId, myUid]);

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

    // The channel cache emits an empty list immediately on a cold boot / post-switch
    // reset, *before* list discovery (a sync plan that runs on a verified socket)
    // writes it — so a raw empty result flashes "No channels yet" for a frame, most
    // visibly on a warm reconnect where the socket is already verified at mount.
    // There's no per-place "list fetched" signal to key off, so hold the skeleton over
    // an empty result for a settle window (discovery's round trip). A verified socket
    // gets a short window; an unverified one gets a longer ceiling so a wake-wedged
    // socket (never re-verifies) resolves to the empty state instead of spinning
    // forever. A populated list is never masked (guarded on length === 0) — it clears
    // the flag the moment it arrives.
    const [confidentEmpty, setConfidentEmpty] = useState(false);
    useEffect(() => {
        if (rawLoading || rawChannels.length > 0) {
            setConfidentEmpty(false);
            return;
        }
        const settle = isVerified ? EMPTY_SETTLE_MS : EMPTY_WEDGE_CEILING_MS;
        const timer = setTimeout(() => setConfidentEmpty(true), settle);
        return () => clearTimeout(timer);
    }, [rawLoading, isVerified, rawChannels.length]);

    const isLoading = rawLoading || (rawChannels.length === 0 && !confidentEmpty);

    return { channels, isLoading };
};
