import { useEffect, useMemo, useState } from 'react';

import { isCloudWideChannel, isInPlaceList, type DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { cloudDmPlaces, computeChannelUnread, placeMemberPeers } from '../utils';
import { useReadCursorStore } from '../stores';
import { useChannelReadCursors } from './useChannelReadCursors';
import { usePlaces } from './usePlaces';

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
 * Streams the channel list for a place from the engine's channel cache. List discovery + per-channel realtime sync are owned
 * globally by the runtime (useBackgroundSync / the sync layer), so this hook only
 * observes the cache: a new message, an invite, or a read updates the cached
 * channel record and re-emits here, keeping unread badges fresh without a manual
 * refetch. The list is reset on place switch so the previous place's channels
 * don't flash.
 *
 * It reads the whole cloud and filters in JS, because the list for a place is not
 * the same thing as the rows whose `sid` names it. A 1:1 opened inside a
 * subscription cloud belongs to the cloud: the server stamps it with whichever
 * place its creator happened to be in, which says nothing about where either
 * participant reads it. So it is listed in the places where its peer shares a
 * group channel with me (`cloudDmPlaces`, which also holds the fallback for a peer
 * found nowhere), and never through the place filter (that half is what keeps it
 * from showing twice in the creator's place). Deciding that needs every place's
 * group channels, which only the whole-cloud read has. Relay 1:1s really do live
 * in the relay's one place and go through the place filter like any group. A per-place `observeList({ sid })`
 * could not serve this: outside the relay the cache scopes that read by `sid`,
 * so the 1:1s stamped with another place never reach it. (apps/web keeps its place
 * list and its cloud 1:1 section apart; desktop's sidebar already buckets 1:1s into
 * their own section, so one list serves both.)
 *
 * `uid` is part of the cache observer's scope key ({cid, sid, uid}) and flips only at
 * cloud-switch commit, after the optimistic `cid` pre-apply. sid alone cannot key the
 * subscription: sids are per-cloud, so a cross-cloud switch can reuse a numerically
 * equal one (a cloud's site '10001' and the relay's site '10001'), leaving the observer
 * bound to the previous cloud's partition and streaming its channels forever. Re-key on
 * uid too. Mirrors apps/web useHomeChannels (57a58278).
 */
export const useChannels = (
    placeId: string | undefined,
    { cloudWideOnly = false }: { cloudWideOnly?: boolean } = {}
) => {
    const { channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { places, isLoading: placesLoading } = usePlaces();
    const [cloudRows, setCloudRows] = useState<DomainChannel[]>([]);
    const [rawLoading, setRawLoading] = useState(true);

    // Render-phase reset on scope switch: drop the old list immediately rather than waiting
    // for the next emit to resolve. Keyed on uid as well as placeId — a cross-cloud switch
    // can land on an equal sid, and only uid tells the two partitions apart.
    const scopeKey = `${myUid ?? ''}:${placeId ?? ''}`;
    const [prevScopeKey, setPrevScopeKey] = useState(scopeKey);
    if (scopeKey !== prevScopeKey) {
        setPrevScopeKey(scopeKey);
        setCloudRows([]);
        setRawLoading(true);
    }

    useEffect(() => {
        // No place: nothing, unless the caller knows the cloud has no place at all — then its 1:1s
        // are all there is to list. A place merely not selected yet (loading, or the site cleared
        // mid-switch) must stay empty, or the home screen would auto-select a 1:1 in that window.
        if (!placeId && !cloudWideOnly) {
            setCloudRows([]);
            setRawLoading(false);
            return;
        }
        setRawLoading(true);
        // The engine's unsubscribe only deregisters the observer — a read already in flight
        // still delivers. On a cloud switch that read resolves after the next subscription has
        // painted and overwrites it with the previous cloud's list, and nothing re-emits until
        // the next cache write (sending a message appeared to "fix" it). Ignore late arrivals.
        let cancelled = false;
        const unsubscribe = channelRepository.observeList({ sid: '' }, result => {
            if (cancelled) return;
            setCloudRows(result?.list ?? []);
            setRawLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [channelRepository, placeId, myUid, cloudWideOnly]);

    const placeIds = useMemo(() => places.map(place => place.id ?? '').filter(Boolean), [places]);
    const dmPlaces = useMemo(
        () => cloudDmPlaces(cloudRows, { myUid: myUid ?? null, placeIds }),
        [cloudRows, myUid, placeIds]
    );
    // The open place's people with no 1:1 here yet, which the sidebar lists after the 1:1s.
    const memberPeers = useMemo(
        () => (placeId ? placeMemberPeers(cloudRows, { myUid: myUid ?? null, placeId, dmPlaces }) : []),
        [cloudRows, myUid, placeId, dmPlaces]
    );
    const rawChannels = useMemo(() => {
        // No place is only read for a cloud that has none, where every 1:1 is all there is.
        const listed = cloudRows.filter(c =>
            placeId ? isInPlaceList(c, placeId) || !!dmPlaces.get(c.id ?? '')?.includes(placeId) : isCloudWideChannel(c)
        );
        return sortByName(listed);
    }, [cloudRows, dmPlaces, placeId]);

    // Read boundary from my synced+observed join row, with the local cursor layered on so reading
    // clears the badge instantly. Server `unreadCount` is not trusted (it lags and never clears).
    const serverCursors = useChannelReadCursors(rawChannels);
    const channels = useMemo(
        () =>
            rawChannels.map(c => ({
                ...c,
                unreadCount: computeChannelUnread(c, myUid ?? null, readCursors[c.id ?? ''], serverCursors[c.id ?? '']),
            })),
        [rawChannels, myUid, readCursors, serverCursors]
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

    // A 1:1 cannot be placed before my places are known, so the list is not final until they are.
    const isLoading = rawLoading || (!!placeId && placesLoading) || (rawChannels.length === 0 && !confidentEmpty);

    return { channels, isLoading, dmPlaces, memberPeers };
};
