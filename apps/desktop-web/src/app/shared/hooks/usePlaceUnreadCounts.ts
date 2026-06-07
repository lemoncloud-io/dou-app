import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';
import type { DomainChannel, DomainChannelListPayload } from '@chatic/data';

import { useRepositories } from '@chatic/app-runtime';
import { computeChannelUnread } from '../utils';

/**
 * Aggregates unread message counts per place for the active cloud, keyed by
 * place id. Fetches all of the current cloud's channels (`hasSite: false`) and
 * sums `unreadCount` per `sid`. Refetches on verify + channel/chat/join events.
 *
 * Trimmed desktop port of apps/web usePlaceUnreadCounts (no native badge sync,
 * no 30s polling) — desktop relies on the always-connected socket for freshness.
 */
export const usePlaceUnreadCounts = (): Record<string, number> => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);

    const [counts, setCounts] = useState<Record<string, number>>({});
    const seqRef = useRef(0);

    const fetchCounts = useCallback(async () => {
        if (!useWebSocketV2Store.getState().isVerified) return;
        const seq = ++seqRef.current;
        try {
            const result = await channelRepository.fetchChannel(
                // `hasSite` is a runtime-only field the engine forwards verbatim but the
                // generated DomainChannelListPayload type omits — cast until upstream adds it.
                { hasSite: false, detail: true, limit: 500 } as unknown as DomainChannelListPayload,
                { cachePolicy: 'network-only' }
            );
            if (seqRef.current !== seq) return;

            const grouped: Record<string, number> = {};
            for (const ch of (result.list ?? []) as DomainChannel[]) {
                if (!ch.sid) continue;
                // Local compute, not server unreadCount — self-sent messages stay at 0.
                grouped[ch.sid] = (grouped[ch.sid] ?? 0) + computeChannelUnread(ch, myUid);
            }
            setCounts(grouped);
        } catch (error) {
            if (seqRef.current === seq) logger.error('PLACE_UNREAD', '[usePlaceUnreadCounts] failed', { error });
        }
    }, [channelRepository, myUid]);

    // Reset on cloud change to avoid showing the previous cloud's badges.
    useEffect(() => {
        setCounts({});
        ++seqRef.current;
    }, [cloudId]);

    useEffect(() => {
        if (isVerified) void fetchCounts();
    }, [isVerified, cloudId, fetchCounts]);

    useEffect(() => {
        const unsubs = [
            channelRepository.onChannelCreated(() => void fetchCounts()),
            channelRepository.onChannelUpdated(() => void fetchCounts()),
            channelRepository.onChannelDeleted(() => void fetchCounts()),
            chatRepository.onChatCreated(() => void fetchCounts()),
            joinRepository.onJoinUpdated(() => void fetchCounts()),
        ];
        return () => unsubs.forEach(fn => fn());
    }, [channelRepository, chatRepository, joinRepository, fetchCounts]);

    return counts;
};
