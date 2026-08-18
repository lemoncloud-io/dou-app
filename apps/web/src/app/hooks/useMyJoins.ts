import { useEffect, useMemo, useRef, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionSelection } from '@chatic/web-core';
import type { DomainChannel, DomainJoin } from '@chatic/data';

interface UseMyJoinsOptions {
    /**
     * Register a per-channel join (read-state) sync while mounted (default true). Set false for
     * observe-only consumers so registration stays SCOPED to the surface that wants it and is torn
     * down the moment that surface unmounts — otherwise the always-mounted shared observation would
     * keep the registrations alive on every route. See {@link useJoinSyncRegistration}.
     */
    sync?: boolean;
}

/**
 * Registers a join (read-state) sync for MY cursor on every channel in `channels`, for as long as
 * the calling surface is mounted. `registerJoin` refcounts by `${channelId}@${uid}`, so overlapping
 * registrations (the room registering every member, home registering me) dedup into one poll.
 *
 * Split out of {@link useMyJoins} because the two halves have different owners: the join MAP is
 * observed once for the whole app (`ActiveCloudDataProvider`), while REGISTRATION must stay scoped
 * to the screen that wants it so it tears down on navigation. A surface that needs both now takes
 * the map from the shared context and calls this hook, instead of opening a second observer per
 * channel to get the registration as a side effect.
 */
export const useJoinSyncRegistration = (
    channels: DomainChannel[],
    { enabled = true }: { enabled?: boolean } = {}
): void => {
    const { isVerified } = useRuntimeSocketState();
    const uid = useGlobalSession().identity.userId ?? undefined;

    const channelIds = channels.map(ch => ch.id);
    const channelKey = channelIds.join(',');

    useEffect(() => {
        if (!enabled || !uid || !isVerified) return;
        const sync = getSyncManager();
        const disposers = channelIds.map(id => sync.registerJoin(`${id}@${uid}`));
        return () => disposers.forEach(dispose => dispose());
        // channelKey captures the set; channelIds is read once per key.
    }, [channelKey, uid, isVerified, enabled]);
};

/**
 * Loads MY join (read cursor) for every channel in `channels` so unread badges read the subscribed
 * join list rather than each channel's embedded `$join` snapshot — the embedded copy lags the live
 * read state (a room read advances the join cache immediately, but `channel.$join` only catches up
 * on the next channel sync).
 *
 * The app mounts this ONCE, observe-only, inside `ActiveCloudDataProvider` — every badge surface
 * reads that shared map instead of opening its own observers (see {@link ActiveCloudData}). Screens
 * that additionally want MY cursor kept live call {@link useJoinSyncRegistration} for their own
 * channel set. The chat room separately registers every member's join while open (useJoinPositions)
 * for read receipts; registerJoin refcounts by key, so any overlapping registration dedups.
 *
 * Returns a channelId → my {@link DomainJoin} map; channels with no synced join row are simply
 * absent (the consumer treats them as "no read boundary yet").
 */
export const useMyJoins = (channels: DomainChannel[], options: UseMyJoinsOptions = {}): Map<string, DomainJoin> => {
    const { sync: shouldSync = true } = options;
    const { join: joinRepository } = useRuntimeRepositories();
    const uid = useGlobalSession().identity.userId ?? undefined;
    const { selectedCloudId } = useSessionSelection();

    const [joinByChannel, setJoinByChannel] = useState<Map<string, DomainJoin>>(new Map());

    // Stable channel-id key so the effects only re-run when the channel set actually changes,
    // not on every render's new array identity.
    const channelIds = channels.map(ch => ch.id);
    const channelKey = channels.map(ch => `${ch.id}:${ch.sid ?? ''}`).join(',');
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id, channel] as const)), [channelKey]);

    // Registration is a separate hook so a surface can own it WITHOUT opening its own observers —
    // home reads the shared cloud-wide join map (ActiveCloudDataProvider) and calls that hook
    // directly. `enabled: false` here keeps the observe-only contract of `sync: false`.
    useJoinSyncRegistration(channels, { enabled: shouldSync });

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
            joinRepository.observeList(
                { channelId: id },
                result => {
                    const mine = result?.list?.find(join => join.userId === uid);
                    if (mine) current.set(id, mine);
                    else current.delete(id);
                    setJoinByChannel(new Map(current));
                },
                { cid: selectedCloudId ?? 'default', sid: channelById.get(id)?.sid, uid }
            )
        );
        return () => disposers.forEach(dispose => dispose());
    }, [joinRepository, channelKey, uid, selectedCloudId, channelById]);

    return joinByChannel;
};
