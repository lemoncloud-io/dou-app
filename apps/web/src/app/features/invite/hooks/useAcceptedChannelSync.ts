import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * How long the waiting screen waits for a locally-synced channel record before giving up and
 * falling back to a home redirect.
 */
const SYNC_TIMEOUT_MS = 8_000;

export type AcceptedChannelSyncStatus =
    /** No `channelId` to watch yet (backend timing not confirmed — ADR-0033 요청 5번). */
    | 'unknown'
    /** Watching `channel.observeItem` for the record to sync locally. */
    | 'waiting'
    /** The channel synced — safe to navigate to the room. */
    | 'ready'
    /** It did not sync within `SYNC_TIMEOUT_MS` — fall back to a home redirect. */
    | 'timeout';

/**
 * Waits for an accepted invite's channel to become available locally.
 *
 * `invite.accept`'s response never carries a `channelId` (the room is created asynchronously),
 * and whether/when `invite.list` later denormalizes one back onto the invite view is an open
 * backend question (roadmap 백엔드 요청 #5). So this only ever has something to watch when the
 * view already happens to carry a `channelId`; otherwise it reports `unknown` immediately so the
 * caller can show a "check back from home" fallback instead of spinning forever.
 */
export const useAcceptedChannelSync = (channelId: string | undefined): { status: AcceptedChannelSyncStatus } => {
    const { channel } = useRuntimeRepositories();
    const [status, setStatus] = useState<AcceptedChannelSyncStatus>(channelId ? 'waiting' : 'unknown');

    useEffect(() => {
        if (!channelId) {
            setStatus('unknown');
            return;
        }

        setStatus('waiting');
        let settled = false;

        const unsubscribe = channel.observeItem(channelId, item => {
            if (settled || !item) return;
            settled = true;
            setStatus('ready');
        });

        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            setStatus('timeout');
        }, SYNC_TIMEOUT_MS);

        return () => {
            unsubscribe();
            clearTimeout(timeoutId);
        };
    }, [channel, channelId]);

    return { status };
};
