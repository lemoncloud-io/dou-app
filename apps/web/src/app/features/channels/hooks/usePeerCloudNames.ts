import { useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';

import { readSelectedCloudId, useSelectedCloudId } from '../../../hooks/useCloudScope';
import { peerCloudNameOf } from '../utils/dmPeer';

const EMPTY: ReadonlyMap<string, string> = new Map();

export interface CloudDmPeerRef {
    channelId: string;
    cid: string;
    peerId: string;
    profileNick?: string;
}

export const usePeerCloudNames = (rows: readonly CloudDmPeerRef[]): ReadonlyMap<string, string> => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const cid = useSelectedCloudId();
    const uid = runtime.session.useUidInCloud(cid);
    const isVerified = runtime.connection.useCloudVerified(cid);
    const scope = `${cid}:${uid ?? ''}`;

    const scopedRows = useMemo(() => rows.filter(row => row.cid === cid), [rows, cid]);

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

    const requestedRef = useRef({ scope, rooms: new Set<string>() });
    if (requestedRef.current.scope !== scope) requestedRef.current = { scope, rooms: new Set() };

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
                if (await userRepository.cacheRead(peerId)) return;
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
