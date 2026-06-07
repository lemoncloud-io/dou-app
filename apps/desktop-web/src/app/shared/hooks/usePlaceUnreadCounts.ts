import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';
import type { DomainChannel, DomainChannelListPayload } from '@chatic/data';

import { useRepositories } from '@chatic/app-runtime';
import { computeChannelUnread } from '../utils';
import { useReadCursorStore } from '../stores';

/**
 * Aggregates unread message counts per place for the active cloud, keyed by
 * place id. Fetches all of the current cloud's channels (`hasSite: false`),
 * computes unread client-side (server unreadCount lags), and sums per `sid`.
 * Refetches on verify + channel/chat/join events; re-derives instantly when the
 * local read cursor advances so a place badge clears the moment you read.
 *
 * Trimmed desktop port of apps/web usePlaceUnreadCounts (no native badge sync,
 * no 30s polling) — desktop relies on the always-connected socket for freshness.
 */
export const usePlaceUnreadCounts = (): Record<string, number> => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    const readCursors = useReadCursorStore(s => s.cursors);

    const [channels, setChannels] = useState<DomainChannel[]>([]);
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
            setChannels((result.list ?? []) as DomainChannel[]);
        } catch (error) {
            if (seqRef.current === seq) logger.error('PLACE_UNREAD', '[usePlaceUnreadCounts] failed', { error });
        }
    }, [channelRepository]);

    // Reset on cloud change to avoid showing the previous cloud's badges.
    useEffect(() => {
        setChannels([]);
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

    return useMemo(() => {
        const grouped: Record<string, number> = {};
        for (const ch of channels) {
            if (!ch.sid) continue;
            grouped[ch.sid] = (grouped[ch.sid] ?? 0) + computeChannelUnread(ch, myUid, readCursors[ch.id ?? '']);
        }
        return grouped;
    }, [channels, myUid, readCursors]);
};
