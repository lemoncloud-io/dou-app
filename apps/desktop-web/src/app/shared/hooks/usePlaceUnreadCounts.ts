import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChannel, DomainChannelListPayload } from '@chatic/data';
import { webClient } from '@chatic/bridges';
import { getSocketManager, useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { computeChannelUnread } from '../utils';
import { useReadCursorStore } from '../stores';

const REFETCH_DEBOUNCE_MS = 300;

/**
 * Per-place unread counts for the active cloud, keyed by sid.
 *
 * Fetches every channel of the active cloud into a flat in-memory list (`channel.fetchList`,
 * `hasSite: false`, with detail) and derives unread client-side — the pre-v2 desktop approach. It
 * deliberately does NOT read the engine cache: the cache keys channels by `cid:uid:id` with no sid,
 * and channel ids collide across places, so the cache can only hold one place's channels at a time.
 * A flat array sidesteps that — it can hold every place's channels at once.
 *
 * Client derivation also avoids the server `channel.unreads` summary's quirk of counting the
 * sender's own not-yet-read-acked messages as unread (the server doesn't advance the sender's read
 * cursor on send): `computeChannelUnread` returns 0 when the latest message is mine, so the place
 * you just posted in never shows a phantom badge.
 *
 * Refetched on the signals that change unread: socket verify / cloud switch, an inbound push or
 * socket chat frame. The local read cursor re-derives instantly (no refetch) so a badge clears the
 * moment you read.
 */
export const usePlaceUnreadCounts = (): Record<string, number> => {
    const { channel: channelRepository } = useRuntimeRepositories();
    const { isVerified } = useSocketState();
    const session = useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const { userId: myUid } = useSessionIdentity();
    const readCursors = useReadCursorStore(s => s.cursors);

    const [channels, setChannels] = useState<DomainChannel[]>([]);
    // Drops a late response from a superseded fetch (cloud switch / newer trigger).
    const seqRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchCounts = useCallback(async () => {
        if (!isVerified) return;
        const seq = ++seqRef.current;
        const result = await channelRepository
            .fetchList({ hasSite: false, limit: 500 } as DomainChannelListPayload)
            .catch(() => null);
        if (seqRef.current !== seq || !result) return;
        setChannels((result.list ?? []) as DomainChannel[]);
    }, [channelRepository, isVerified]);

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void fetchCounts(), REFETCH_DEBOUNCE_MS);
    }, [fetchCounts]);

    // Reset on cloud change so the previous cloud's badges don't linger mid-switch.
    useEffect(() => {
        setChannels([]);
        ++seqRef.current;
    }, [cloudId]);

    // Fetch on verify / cloud switch (isVerified dips then rises on a switch, after the socket
    // re-auths to the new cloud — so the list is for the right cloud).
    useEffect(() => {
        if (isVerified) void fetchCounts();
    }, [isVerified, cloudId, fetchCounts]);

    // Refetch on inbound activity — an FCM push or a raw socket chat frame both mean a channel's
    // unread may have changed. onMessage needs a live client, so bind through subscribeClient.
    useEffect(() => {
        const offPush = webClient.onEvent('OnReceiveNotification', schedule);
        const manager = getSocketManager();
        let offMessage: (() => void) | undefined;
        const offClient = manager.subscribeClient(client => {
            offMessage?.();
            offMessage = undefined;
            if (!client) return;
            offMessage = manager.onMessage(({ message }) => {
                const type = (message as { type?: string })?.type ?? '';
                if (type.startsWith('chat')) schedule();
            });
        });
        return () => {
            offPush();
            offMessage?.();
            offClient();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [schedule]);

    return useMemo(() => {
        const grouped: Record<string, number> = {};
        for (const ch of channels) {
            if (!ch.sid) continue;
            // Read boundary: the channel's own `$join` (chatNo + the metaNo snapshot that nets
            // system messages out), with the local cursor clearing the badge on read.
            grouped[ch.sid] = (grouped[ch.sid] ?? 0) + computeChannelUnread(ch, myUid, readCursors[ch.id ?? '']);
        }
        for (const sid of Object.keys(grouped)) {
            if (!grouped[sid]) delete grouped[sid];
        }
        return grouped;
    }, [channels, myUid, readCursors]);
};
