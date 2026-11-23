import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { displayName } from '../../../shared';

export interface DmPeerRef {
    channelId: string;
    peerId: string;
}

export const useHydrateDmPeers = (peers: readonly DmPeerRef[]): void => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const requestedRef = useRef(new Map<string, Set<string>>());

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
