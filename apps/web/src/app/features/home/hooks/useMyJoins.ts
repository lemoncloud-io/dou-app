import { useEffect, useRef, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainChannel, DomainJoin } from '@chatic/data';

interface UseMyJoinsOptions {
    /**
     * Register a per-channel join (read-state) sync while mounted (default true). Set false for
     * observe-only consumers (the app-global badge / bottom-nav) so join sync registration stays
     * SCOPED to the home surface (HomePage) and is torn down the moment home unmounts — otherwise
     * the always-mounted layout/badge would keep the registrations alive on every route.
     */
    sync?: boolean;
}

/**
 * Loads MY join (read cursor) for every channel in the active cloud so the home unread badges read
 * the subscribed join list rather than each channel's embedded `$join` snapshot — the embedded copy
 * lags the live read state (a room read advances the join cache immediately, but `channel.$join`
 * only catches up on the next channel sync).
 *
 * With `sync` (default), registers a join (read-state) sync per channel keyed `${channelId}@${myUserId}`
 * so my cursor stays current while mounted. Only HomePage does this, so leaving home tears the
 * registrations down. Observe-only consumers (UnreadBadgeRunner / UnifiedLayout, `sync: false`) still
 * get a live map from the join cache — reflecting my own reads (optimistic cache writes) and new
 * messages (channel head from the cloud-wide syncChannels) — and reconcile fully on the next home
 * visit. The chat room separately registers every member's join while open (useJoinPositions) for
 * read receipts; registerJoin refcounts by key, so any overlapping registration dedups.
 *
 * Returns a channelId → my {@link DomainJoin} map; channels with no synced join row are simply
 * absent (the consumer treats them as "no read boundary yet").
 */
export const useMyJoins = (channels: DomainChannel[], options: UseMyJoinsOptions = {}): Map<string, DomainJoin> => {
    const { sync: shouldSync = true } = options;
    const { join: joinRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const uid = useGlobalSession().identity.userId ?? undefined;

    const [joinByChannel, setJoinByChannel] = useState<Map<string, DomainJoin>>(new Map());

    // Stable channel-id key so the effects only re-run when the channel set actually changes,
    // not on every render's new array identity.
    const channelIds = channels.map(ch => ch.id);
    const channelKey = channelIds.join(',');

    // Register a join sync per channel for my user, keeping my read cursor live while mounted.
    // Skipped for observe-only consumers (sync: false) so registration ownership stays with home.
    useEffect(() => {
        if (!shouldSync || !uid || !isVerified) return;
        const sync = getSyncManager();
        const disposers = channelIds.map(id => sync.registerJoin(`${id}@${uid}`));
        return () => disposers.forEach(dispose => dispose());
        // channelKey captures the set; channelIds is read once per key.
    }, [channelKey, uid, isVerified, shouldSync]);

    // Observe the join cache per channel and collect my join row into the channelId → join map.
    // A shared mutable map is rebuilt into a fresh identity on each emit so consumers re-render.
    const mapRef = useRef(new Map<string, DomainJoin>());
    useEffect(() => {
        if (!joinRepository || !uid) return;
        const current = mapRef.current;
        const activeIds = new Set(channelIds);
        // Drop cursors for channels no longer in the set so stale entries can't linger.
        for (const id of current.keys()) {
            if (!activeIds.has(id)) current.delete(id);
        }

        const disposers = channelIds.map(id =>
            joinRepository.observeList({ channelId: id }, result => {
                const mine = result?.list?.find(join => join.userId === uid);
                if (mine) current.set(id, mine);
                else current.delete(id);
                setJoinByChannel(new Map(current));
            })
        );
        return () => disposers.forEach(dispose => dispose());
    }, [joinRepository, channelKey, uid]);

    return joinByChannel;
};
