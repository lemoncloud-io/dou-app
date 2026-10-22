import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { readSelectedCloudId, useSelectedCloudId } from '../../../hooks/useCloudScope';
import { peerCloudNameOf } from '../utils/dmPeer';

const EMPTY: ReadonlyMap<string, string> = new Map();

/** One cloud 1:1 row on a list: the room, its cloud, and the person it stands for. */
export interface CloudDmPeerRef {
    channelId: string;
    /** The room's cloud — a row of any other cloud than the selected one is ignored. */
    cid: string;
    peerId: string;
    /** The peer's place-profile nick, when the list already has one — such a row needs no request. */
    profileNick?: string;
}

/**
 * Cloud-profile names (`peerId -> name`) for the peers of a list's cloud 1:1 rows, read from the
 * selected cloud's user cache.
 *
 * Nothing on a list fills that cache — only an open room loads its members (`syncChannelUsers`) — so
 * a 1:1 with someone who has no profile in this place would read as the unnamed label until it was
 * opened once. For each row whose peer has neither a place nick nor a cached record, the room's
 * members are therefore loaded **once per room per mount**. A warm cache costs no request. A row is
 * checked for a place nick again after its cache read, because the place profiles usually arrive
 * just after the first render: a row they name by then is not loaded either. A failed load is logged
 * and may be retried the next time the rows change.
 *
 * **Scoped to the selected cloud and my uid in it.** The repository the app hands out is one object
 * whose cloud is read at call time, so its identity says nothing about which cloud it reads. A
 * subscription or a name from the previous cloud (or account) must not outlive a switch, and a load
 * must not be sent once the selection has moved — it would carry the old cloud's room id into the
 * new cloud's session.
 *
 * Subscribes per peer (`observeItem`), not to the whole cache: a list holds a handful of 1:1s, and
 * the cache holds everyone this cloud has ever shown.
 */
export const usePeerCloudNames = (rows: readonly CloudDmPeerRef[]): ReadonlyMap<string, string> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const cid = useSelectedCloudId();
    const uid = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);
    const scope = `${cid}:${uid ?? ''}`;

    // During a switch the list can still hold the previous cloud's rows for a render.
    const scopedRows = useMemo(() => rows.filter(row => row.cid === cid), [rows, cid]);

    // The caller rebuilds `rows` on every render; effects key on these strings and read the rows
    // through a ref.
    const peerKey = useMemo(() => [...new Set(scopedRows.map(row => row.peerId))].sort().join(','), [scopedRows]);
    const unnamedKey = useMemo(
        () =>
            scopedRows
                .filter(row => !row.profileNick?.trim())
                .map(row => `${row.channelId}\u0000${row.peerId}`)
                .sort()
                .join('\u0001'),
        [scopedRows]
    );
    const rowsRef = useRef(scopedRows);
    rowsRef.current = scopedRows;

    const [state, setState] = useState<{ scope: string; names: ReadonlyMap<string, string> }>({
        scope,
        names: EMPTY,
    });

    useEffect(() => {
        const peers = peerKey ? peerKey.split(',') : [];
        // Only a peer who left the list is dropped. Clearing everyone on any change would flash the
        // unnamed label on every row while the cache re-emits — the emission is asynchronous.
        setState(prev => {
            if (prev.scope !== scope) return { scope, names: EMPTY };
            const kept = new Map([...prev.names].filter(([peerId]) => peers.includes(peerId)));
            return kept.size === prev.names.size ? prev : { scope, names: kept };
        });
        const unsubscribes = peers.map(peerId =>
            userRepository.observeItem(peerId, user => {
                const name = peerCloudNameOf(user, peerId);
                setState(prev => {
                    if (prev.scope !== scope || prev.names.get(peerId) === name) return prev;
                    const names = new Map(prev.names);
                    if (name) names.set(peerId, name);
                    else names.delete(peerId);
                    return { scope, names };
                });
            })
        );
        return () => unsubscribes.forEach(unsubscribe => unsubscribe());
    }, [userRepository, peerKey, scope]);

    // Rooms already asked about in this cloud and account, so a re-render or a re-sorted list asks
    // again for none.
    const requestedRef = useRef({ scope, rooms: new Set<string>() });
    if (requestedRef.current.scope !== scope) requestedRef.current = { scope, rooms: new Set() };

    // Unmount, not effect cleanup, stops a pending load. The effect re-runs whenever a row's place nick
    // lands; abandoning the reads of the previous run then would drop rows the new run skips as
    // already asked. Each pending read re-checks its row instead.
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!isVerified || !unnamedKey) return;
        const requested = requestedRef.current.rooms;
        for (const { channelId, peerId, profileNick } of rowsRef.current) {
            if (profileNick?.trim() || requested.has(channelId)) continue;
            requested.add(channelId);
            void (async () => {
                // Any record means the members were loaded before; one whose name is a placeholder
                // would only come back the same, so it is not asked for again either.
                if (await userRepository.cacheRead(peerId)) return;
                // The read is awaited, so the screen, the selection or the row may have moved under
                // it. A switch starts a fresh request set for the next cloud, which asks for itself.
                if (!mountedRef.current || readSelectedCloudId() !== cid) return;
                const latest = rowsRef.current.find(row => row.channelId === channelId);
                if (!latest || latest.profileNick?.trim()) return;
                await userRepository.syncChannelUsers({ channelId, since: 0 });
            })().catch((error: unknown) => {
                requested.delete(channelId);
                logger.warn('CHANNEL', '[usePeerCloudNames] member load failed', { channelId, error });
            });
        }
    }, [userRepository, isVerified, unnamedKey, cid]);

    return state.scope === scope ? state.names : EMPTY;
};
