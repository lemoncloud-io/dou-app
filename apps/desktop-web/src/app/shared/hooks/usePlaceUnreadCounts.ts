import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { computeChannelUnread } from '../utils';
import { useReadCursorStore } from '../stores';

/**
 * Aggregates unread message counts per place for the active cloud, keyed by
 * place id. Observes every cached channel of the active cloud, computes unread
 * client-side (server unreadCount lags), and sums per `sid`. Re-derives instantly
 * when the local read cursor advances so a place badge clears the moment you read.
 *
 * Trimmed desktop port of apps/web usePlaceUnreadCounts (no native badge sync,
 * no 30s polling) — desktop relies on the always-connected socket for freshness.
 * List discovery + delta sync is owned globally by useBackgroundSync; this hook
 * only reads the live engine cache via observeList (mirrors apps/web useChannelUnreads).
 */
export const usePlaceUnreadCounts = (): Record<string, number> => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();
    // `cloudId` is gone from socket state in v2 — derive the active cloud from the session.
    const session = useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const { userId: myUid } = useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // Reset on cloud change to avoid showing the previous cloud's badges mid-switch.
    useEffect(() => {
        setChannels([]);
    }, [cloudId]);

    useEffect(() => {
        if (!isVerified) return;
        // Observe every cached channel for the active cloud (all places — empty query).
        // The cache is scoped to the active cloud context, so a switch re-emits the new
        // cloud's set; cloudId stays in the deps to re-subscribe across switches.
        return channelRepository.observeList({}, result => {
            setChannels((result?.list ?? []) as DomainChannel[]);
        });
    }, [channelRepository, isVerified, cloudId]);

    return useMemo(() => {
        const grouped: Record<string, number> = {};
        for (const ch of channels) {
            if (!ch.sid) continue;
            grouped[ch.sid] = (grouped[ch.sid] ?? 0) + computeChannelUnread(ch, myUid, readCursors[ch.id ?? '']);
        }
        return grouped;
    }, [channels, myUid, readCursors]);
};
