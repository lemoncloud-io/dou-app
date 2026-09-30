import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { ACCOUNT_CHANNEL_SID, type DomainChannel } from '@chatic/data';

import { useHasChannelSync } from '../stores/useChannelSyncMarkStore';
import { useColdListWindowElapsed } from './useColdListWindow';
import { useCloudPlaceIds, type CloudPartition } from './useAccessiblePlaceIds';
import { useActiveCloudData } from './activeCloudDataContext';

/**
 * Observes the active cloud's channel list across every site, not just the selected one, and drops
 * the ones the user can no longer reach.
 *
 * That last part is the whole reason unread counts could get stuck. A channel whose place has left
 * the rail — access revoked, place deleted — keeps its cached row and its unread, and it shows up in
 * exactly one of the three outputs derived from this list: not in the channel list (home renders the
 * active site only) and not as a place dot (a place absent from the rail has nowhere to draw one),
 * but yes in `total`, which is the app-icon badge. Nothing on screen said anything was unread and
 * the badge would not go down, because there was no way to open the room and read it.
 *
 * Filtering waits for the place list to resolve: an unresolved list is "don't know yet", never "no
 * places", or the badge would blink to zero on every cloud switch. A channel with no `sid` at all is
 * kept — that is a row mid-sync, not an orphan.
 *
 * An empty `sid` takes the unfiltered branch of the channel cache read, so this returns all
 * channels for the active cloud (each still tagged with its own sid). It's the single source the
 * home unread aggregation derives the per-place / cloud totals from. Cache observe only — no
 * per-channel realtime registration; freshness rides useBackgroundSync's periodic cloud-wide
 * `syncChannels` delta (ChannelView carries `$join`/`lastChat$`/`metaNo` inline).
 *
 * Re-subscribe timing: the channel cache is cloud-wide and its observer scope keys by {cid, uid}
 * (sid dropped — see ChannelLocalDataSource.getScopeKey), so an observer keeps matching writes
 * while its captured {cid, uid} equals the active one. Only cloud (cid) and uid switches change that
 * scope — a site switch does NOT, since the cloud-wide read (`{sid: ''}`) returns the same set for
 * every site — so this observer is not keyed on the active sid at all.
 *
 * SCOPE PINNING — the {cid, uid} override keys the observer off the React session directly instead of
 * the live DataContextProvider (`ActiveScope`). `ActiveScope` now derives its `intent` straight from
 * `session/store` on every read (ADR-0070 decision 7), not from an ancestor effect, so the commit-lag this
 * override originally guarded against — `RuntimeDataBinder` used to push `binding.context` into the
 * provider in an effect that ran AFTER this descendant hook subscribed — can no longer happen through
 * that path: that binder has been deleted. The override still matters
 * because `ActiveScope.getContext()` also folds in the socket's bound cid as `socketCid`, which this
 * cloud-wide observer does not want in its scope key. See PlaceLocalDataSource reemit-routing tests.
 */
export const useActiveCloudChannelsSource = (): { channels: DomainChannel[]; isLoaded: boolean } => {
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const uid = runtime.session.useGlobalSession().identity.userId ?? undefined;
    return useCloudChannelsSource({ cid: selectedCloudId ?? 'default', uid });
};

/**
 * The same observation for a named cloud — the active one above, or a cloud off screen, whose list
 * its background receive loop keeps current (see `OtherCloudUnreadProvider`). `uid` is the one the
 * account has in THAT cloud: every cloud gives it a different one, and the partition is keyed by it.
 *
 * Reading another cloud through the app's repositories is safe because the observer names its scope
 * outright ({cid, uid}); nothing here reaches that cloud's socket.
 */
export const useCloudChannelsSource = ({
    cid,
    uid,
}: CloudPartition): { channels: DomainChannel[]; isLoaded: boolean } => {
    const { channel } = runtime.data.useRuntimeRepositories();
    const accessiblePlaceIds = useCloudPlaceIds({ cid, uid });

    const [channels, setChannels] = useState<DomainChannel[]>([]);
    /**
     * Whether the CACHE has answered once for the current scope. Not the same as `isLoaded` below:
     * an empty array cannot serve as a loading signal on its own, because a cloud with no channels
     * yet and a cloud whose first read has not landed look identical.
     */
    const [hasCacheAnswered, setHasCacheAnswered] = useState(false);
    // Whether this cloud's channel delta has come back from the server at least once this session.
    const hasChannelSync = useHasChannelSync(cid, uid);
    // ...and the bound on waiting for it, for the case where it never arrives at all.
    const hasColdWindowElapsed = useColdListWindowElapsed(`channel:${cid}:${uid ?? ''}`);

    // Clear only when the cloud/uid actually changes — the cloud-wide list is the same set across a
    // site switch, so clearing there would flash an empty list for no reason.
    const scopeRef = useRef(`${cid}|${uid ?? ''}`);

    useEffect(() => {
        if (!channel) return;
        const scope = `${cid}|${uid ?? ''}`;
        if (scopeRef.current !== scope) {
            scopeRef.current = scope;
            setChannels([]);
            setHasCacheAnswered(false);
        }
        return channel.observeList(
            { sid: '' },
            result => {
                setChannels(result?.list ?? []);
                setHasCacheAnswered(true);
            },
            { cid, uid }
        );
    }, [channel, cid, uid]);

    // Only this cloud's rows, decided at render: the reset above runs in an effect, so the render in
    // which the selection moves still holds the previous cloud's list, and each rendered row would
    // register its channel's sync target under the new cloud — whose socket, with a background
    // session per cloud, is already up to receive the previous cloud's channel ids.
    const inCloud = useMemo(() => channels.filter(row => row.cid === cid), [channels, cid]);

    /**
     * COLD CLOUD — the cache answers `[]` instantly for a cloud this device has never opened, before
     * the first `channel.syncChannels` has been sent, so "the cache answered" is not yet an answer
     * about the cloud. An empty list therefore stays unloaded until something explains it, which is
     * what keeps the chat section on skeletons instead of flashing "no rooms" through a cold switch.
     *
     * Three things can explain it, cheapest first: rows in the cache (a cloud visited before is
     * loaded the moment it emits), the first delta answering (which is how a place that really has
     * no rooms — every place, at the start — says so within a round trip rather than a whole
     * window), and the window elapsing (the bound for when neither ever happens). The rows counted
     * are this cloud's: the previous cloud's must not read as "loaded".
     */
    const isLoaded = hasCacheAnswered && (inCloud.length > 0 || hasChannelSync || hasColdWindowElapsed);

    const accessible = useMemo(() => {
        if (!accessiblePlaceIds) return inCloud;
        // The notes-to-self room is kept under the account, not a place, when nothing names one.
        return inCloud.filter(row => !row.sid || row.sid === ACCOUNT_CHANNEL_SID || accessiblePlaceIds.has(row.sid));
    }, [inCloud, accessiblePlaceIds]);

    return useMemo(() => ({ channels: accessible, isLoaded }), [accessible, isLoaded]);
};

/**
 * The active cloud's channel rows, from the ONE shared observation (see {@link ActiveCloudData}).
 * Mounting this costs nothing — the subscription lives in `ActiveCloudDataProvider`.
 */
export const useActiveCloudChannels = (): DomainChannel[] => useActiveCloudData().channels;
