import { useCallback, useEffect, useMemo, useState } from 'react';

import { useGlobalCacheSearch, globalCacheRefKey } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '@chatic/web-core';

import { countUnread, readCursorOf } from '../utils/countUnread';
import { useInvitedClouds } from './useInvitedClouds';

/** Relay mode reads as this cloud id (see useSessionSelection). */
const RELAY_CLOUD_ID = 'default';

export interface OtherCloudUnread {
    /** Unread per inactive cloud id; clouds with nothing cached are simply absent. */
    byCloud: Record<string, number>;
    /** Sum across every inactive cloud. */
    total: number;
    /** Re-reads the cache. Cheap enough to call whenever the active count moves. */
    refresh: () => void;
}

/**
 * Unread for the clouds the user is NOT currently in, read from the local cache.
 *
 * Repositories cannot answer this: their reads are scoped to the active cloud, and the context
 * override is a sid override rather than a cid one. `resolveContext` is the codebase's only
 * cross-cloud reader (see GlobalCacheContextQuery's note) and it takes exactly what an unread
 * count needs — every cached channel per cloud, plus MY join row for each.
 *
 * WHAT THIS REPLACES, and why it is better: the badge used to sum a localStorage snapshot of each
 * cloud's last-visited total. Nothing ever cleared an inactive cloud's entry, so a count frozen at
 * the moment you switched away stayed on the app icon forever — the phantom badge. Recomputing
 * from the channel head and my read cursor has no such entry to go stale: a cloud that leaves the
 * cache leaves the count, and any later cache write (a push, a cold sync, a revisit) is picked up.
 *
 * WHAT IT STILL CANNOT DO: an inactive cloud is not synced, so this is the last cached state, not
 * the truth. Messages that arrived, or reads made on another device, are invisible until that cloud
 * is opened again. A live cross-cloud count needs a server-side summary; the client cannot get
 * there on its own.
 */
export const useOtherCloudUnread = (activeCloudId: string): OtherCloudUnread => {
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const { resolveContext } = useGlobalCacheSearch();

    const [byCloud, setByCloud] = useState<Record<string, number>>({});
    const [token, setToken] = useState(0);
    const refresh = useCallback(() => setToken(n => n + 1), []);

    // Owned + invited + relay, minus wherever the user is now — that one is observed live by the
    // caller and would otherwise be counted from a staler source.
    const cids = useMemo(() => {
        const ids = new Set<string>([RELAY_CLOUD_ID]);
        for (const cloud of ownedClouds) if (cloud.id) ids.add(cloud.id);
        for (const cloud of invitedClouds) if (cloud.id) ids.add(cloud.id);
        ids.delete(activeCloudId);
        return [...ids].sort();
    }, [ownedClouds, invitedClouds, activeCloudId]);

    // Joined so the effect re-runs on membership changes, not on every new array identity.
    const cidsKey = cids.join(',');

    useEffect(() => {
        if (cids.length === 0) {
            setByCloud({});
            return;
        }
        let cancelled = false;
        // No channelRefs: this needs the per-cloud channel and join maps, not the newest message
        // per channel, and asking for refs would add a cursor read per channel for nothing.
        void resolveContext({ cids, channelRefs: [] })
            .then(context => {
                if (cancelled) return;
                // Which places each cloud still has cached. Same rule the active cloud applies: a
                // channel whose place is gone cannot be opened, so its unread can never be read
                // away and must not sit on the badge. A cloud with no cached places at all is not
                // filtered — that is an unsynced cloud, not a cloud without places.
                const placesByCloud = new Map<string, Set<string>>();
                for (const ref of Object.keys(context.sitesByRef)) {
                    const [cid, sid] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
                    if (!cid || !sid) continue;
                    const known = placesByCloud.get(cid) ?? new Set<string>();
                    known.add(sid);
                    placesByCloud.set(cid, known);
                }

                const totals: Record<string, number> = {};
                for (const [ref, channel] of Object.entries(context.channelsByRef)) {
                    // The map key carries the cloud; the channel row itself does not.
                    const cid = ref.slice(0, ref.indexOf(':'));
                    if (!cid || !channel.id) continue;
                    const places = placesByCloud.get(cid);
                    if (places && channel.sid && !places.has(channel.sid)) continue;
                    const unread = countUnread({
                        headChatNo: channel.chatNo,
                        headMetaNo: channel.metaNo,
                        readNo: readCursorOf(context.joinsByRef[globalCacheRefKey(cid, channel.id)]),
                    });
                    if (unread > 0) totals[cid] = (totals[cid] ?? 0) + unread;
                }
                setByCloud(totals);
            })
            .catch(() => {
                // A cache read that fails leaves the previous totals in place: the badge showing a
                // slightly old number beats it dropping to the active cloud's count and back.
            });
        return () => {
            cancelled = true;
        };
        // Keyed on `cidsKey`, not `cids`: the array is rebuilt every render, so depending on it
        // would re-read the cache on identity alone.
    }, [cidsKey, token, resolveContext]);

    const total = useMemo(() => Object.values(byCloud).reduce((sum, n) => sum + n, 0), [byCloud]);

    return { byCloud, total, refresh };
};
