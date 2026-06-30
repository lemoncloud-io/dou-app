import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionIdentity, useSessionSelection } from '@chatic/web-core';

import { computeChannelUnread, resolveReadNo } from '../utils';
import { useReadCursorStore } from '../stores';
import { useChannelReadCursors } from './useChannelReadCursors';

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
    const { selectedSiteId } = useSessionSelection();
    const readCursors = useReadCursorStore(s => s.cursors);

    const [channels, setChannels] = useState<DomainChannel[]>([]);

    // Reset on cloud change to avoid showing the previous cloud's badges mid-switch.
    useEffect(() => {
        setChannels([]);
    }, [cloudId]);

    useEffect(() => {
        if (!isVerified) return;
        // Observe every cached channel of the active cloud across ALL places. An empty
        // query falls back to the active place's sid (both the cache filter and the
        // observer scope), so it would only ever surface the active place — breaking the
        // per-place aggregation. `sid: ''` is falsy, so the local data source returns the
        // full channel set; the observer still lives in the active scope (no context
        // override), so realtime channel writes reemit it. `selectedSiteId` is in the deps
        // to re-scope the observer on a place switch (scope is keyed by the active sid).
        return channelRepository.observeList({ sid: '' }, result => {
            setChannels((result?.list ?? []) as DomainChannel[]);
        });
    }, [channelRepository, isVerified, cloudId, selectedSiteId]);

    // Read boundary per channel from the synced+observed join rows (server unreadCount lags and
    // never clears, so it isn't trusted); the local cursor is layered on for instant clearing.
    const serverReadNo = useChannelReadCursors(channels);

    return useMemo(() => {
        const grouped: Record<string, number> = {};
        for (const ch of channels) {
            if (!ch.sid) continue;
            grouped[ch.sid] =
                (grouped[ch.sid] ?? 0) +
                computeChannelUnread(ch, myUid, resolveReadNo(ch.id ?? '', serverReadNo, readCursors));
        }
        return grouped;
    }, [channels, myUid, readCursors, serverReadNo]);
};
