import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { displayName } from '../../../shared';

export interface DmPeerRef {
    channelId: string;
    peerId: string;
}

/**
 * Load the members of each listed 1:1 whose peer has no name in the user cache yet, so the sidebar
 * row shows the person instead of the server-set room name.
 *
 * A row reads its name from the current place's profile, then from the user cache. Nothing on the
 * list fills that cache: only an open room loads its members. A 1:1 with someone who has no profile
 * in this place (a cloud 1:1 is listed in every place) therefore showed the room name until it was
 * opened once. Pass only the rows the place profile does not already name.
 *
 * Each room is asked at most once per mount, and only when its peer is still unnamed after a cache
 * read, so a warm cache costs no request. A failed load is logged and may be retried on the next
 * change to the list.
 */
export const useHydrateDmPeers = (peers: readonly DmPeerRef[]): void => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const requestedRef = useRef(new Set<string>());

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
        for (const { channelId, peerId } of peersRef.current) {
            if (requested.has(channelId)) continue;
            requested.add(channelId);
            void (async () => {
                const cached = await userRepository.cacheRead(peerId);
                const name = cached ? displayName(cached) : '';
                if (name && name !== peerId) return;
                await userRepository.syncChannelUsers({ channelId, since: 0 });
            })().catch((error: unknown) => {
                requested.delete(channelId);
                logger.warn('CHANNEL', '[useHydrateDmPeers] member load failed', { channelId, error });
            });
        }
    }, [userRepository, isVerified, key]);
};
