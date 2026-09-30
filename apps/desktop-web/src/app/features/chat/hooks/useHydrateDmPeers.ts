import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { displayName } from '../../../shared';

export interface DmPeerRef {
    channelId: string;
    peerId: string;
}

/**
 * Load the members of each room that stands for a sidebar person with no name in the user cache
 * yet, so the row shows the person instead of the server-set room name. The room is the 1:1 for a
 * 1:1 row, and a group channel of the place for a member with no 1:1 — several people can share it.
 *
 * A row reads its name from the current place's profile, then from the user cache. Nothing on the
 * list fills that cache: only an open room loads its members. A 1:1 with someone who has no profile
 * in this place (members need not set one, and a 1:1 whose peer shares no place with me
 * falls back to places the peer is not in) therefore showed the room name until it was
 * opened once. Pass only the rows the place profile does not already name.
 *
 * Each person is asked about at most once per mount. A room is loaded only when one of the people
 * newly asked about is still unnamed after a cache read, so a warm cache costs no request. A failed
 * load is logged and may be retried on the next change to the list.
 */
export const useHydrateDmPeers = (peers: readonly DmPeerRef[]): void => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    // Per room, the people already asked about: a group room's people change while the list is up.
    const requestedRef = useRef(new Map<string, Set<string>>());

    // The caller rebuilds `peers` on every render; the effect keys on this string instead, and reads
    // the rows through a ref so it never parses ids back out of it.
    const key = peers
        .map(p => `${p.channelId}\u0000${p.peerId}`)
        .sort()
        .join('\u0001');
    const peersRef = useRef(peers);
    peersRef.current = peers;

    useEffect(() => {
        if (!isVerified || !key) return;
        const requested = requestedRef.current;
        const peersByRoom = new Map<string, string[]>();
        for (const { channelId, peerId } of peersRef.current) {
            const roomPeers = peersByRoom.get(channelId);
            if (roomPeers) roomPeers.push(peerId);
            else peersByRoom.set(channelId, [peerId]);
        }
        for (const [channelId, peerIds] of peersByRoom) {
            const asked = requested.get(channelId) ?? new Set<string>();
            const fresh = peerIds.filter(peerId => !asked.has(peerId));
            if (fresh.length === 0) continue;
            fresh.forEach(peerId => asked.add(peerId));
            requested.set(channelId, asked);
            void (async () => {
                const names = await Promise.all(
                    fresh.map(async peerId => {
                        const cached = await userRepository.cacheRead(peerId);
                        const name = cached ? displayName(cached) : '';
                        return name && name !== peerId;
                    })
                );
                if (names.every(Boolean)) return;
                await userRepository.syncChannelUsers({ channelId, since: 0 });
            })().catch((error: unknown) => {
                fresh.forEach(peerId => asked.delete(peerId));
                logger.warn('CHANNEL', '[useHydrateDmPeers] member load failed', { channelId, error });
            });
        }
    }, [userRepository, isVerified, key]);
};
