import { useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { computeChannelUnread, resolveReadNo } from '../utils';
import { useCloudChannelsStore, useReadCursorStore } from '../stores';
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
 * active place and the list is reset on cloud or place switch so the previous
 * scope's channels don't flash.
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { userId: myUid } = useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);
    const { isVerified } = useSocketState();
    // The cache is partitioned by the SELECTED cloud id (cid) — the same value
    // useRuntimeBinding derives for the observe scope. Track it here: place ids (sid)
    // collide across clouds, so a cloud switch can leave `placeId` unchanged; without
    // keying on cid too, the reset never fires and the observer never re-subscribes,
    // leaving the previous cloud's channels on screen until a reload.
    const activeCid = useGlobalSession().cloud?.cloudId ?? 'default';
    const [rawChannels, setRawChannels] = useState<DomainChannel[]>([]);
    const [rawLoading, setRawLoading] = useState(true);

    // Render-phase reset on cloud OR place switch (mirrors apps/web useChannels): drop
    // the old list immediately rather than waiting for the next emit to resolve.
    const scope = `${activeCid}:${placeId ?? ''}`;
    const [prevScope, setPrevScope] = useState(scope);
    if (scope !== prevScope) {
        setPrevScope(scope);
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
        // activeCid: re-subscribe on a cloud switch so the observer re-reads the new
        // cloud's cache partition even when the colliding sid leaves placeId unchanged.
    }, [channelRepository, placeId, activeCid]);

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

    // Cloud-switch settle gate. The channel cache is cid-partitioned but a switch flips the
    // cid optimistically while the old cloud's socket is still delivering, so the target
    // partition can transiently hold the previous cloud's rows (stamped with the new cid, so
    // a read filter can't undo it). Rather than flash those, hold the skeleton until the new
    // cloud's socket re-verifies — the switch drops it to unverified while it reconnects, so
    // "verified again on the current cid" means its discovery has run and the list is real.
    // `readyCid` is only advanced on an isVerified change (never on the cid change itself), so
    // a switch that flips cid while still momentarily verified doesn't mark the new cloud ready
    // early. Bounded by the wedge ceiling so a socket that never re-verifies still resolves.
    const activeCidRef = useRef(activeCid);
    activeCidRef.current = activeCid;
    const [readyCid, setReadyCid] = useState(activeCid);
    useEffect(() => {
        if (isVerified) setReadyCid(activeCidRef.current);
    }, [isVerified]);
    const settling = readyCid !== activeCid;
    const [settleExpired, setSettleExpired] = useState(false);
    useEffect(() => {
        if (!settling) {
            setSettleExpired(false);
            return;
        }
        const timer = setTimeout(() => setSettleExpired(true), EMPTY_WEDGE_CEILING_MS);
        return () => clearTimeout(timer);
    }, [settling]);
    const holdForSwitch = settling && !settleExpired;

    // Per-cloud snapshot: keep each cloud's last verified list so switching back and forth
    // shows that cloud's channels INSTANTLY — no skeleton, no flash of the other cloud's rows.
    // While a switch is settling we render this cloud's snapshot (if any) instead of the live
    // rows, which may still be the previous cloud's; once verified, the fresh list takes over
    // and refreshes the snapshot. First-ever visit (no snapshot) still shows the skeleton.
    const snapshot = useCloudChannelsStore(s => s.byCloud[activeCid]);
    const rememberChannels = useCloudChannelsStore(s => s.remember);
    useEffect(() => {
        if (!settling && !rawLoading) rememberChannels(activeCid, rawChannels);
    }, [settling, rawLoading, rawChannels, activeCid, rememberChannels]);

    const sourceChannels = settling && snapshot ? snapshot : rawChannels;

    // Read boundary from my synced+observed join row, with the local cursor layered on so reading
    // clears the badge instantly. Server `unreadCount` is not trusted (it lags and never clears).
    const serverReadNo = useChannelReadCursors(sourceChannels);
    const channels = useMemo(
        () =>
            sourceChannels.map(c => ({
                ...c,
                unreadCount: computeChannelUnread(
                    c,
                    myUid ?? null,
                    resolveReadNo(c.id ?? '', serverReadNo, readCursors)
                ),
            })),
        [sourceChannels, myUid, readCursors, serverReadNo]
    );

    // A snapshot means this cloud has been shown before — render it immediately (never a
    // skeleton on a revisit). Only the first visit falls back to the load/settle gates.
    const isLoading = snapshot ? false : rawLoading || holdForSwitch || (rawChannels.length === 0 && !confidentEmpty);

    return { channels, isLoading };
};
