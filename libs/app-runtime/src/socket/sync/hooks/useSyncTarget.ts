import { useEffect } from 'react';

import type { SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';

import { getSyncManager } from '../../runtime';

const buildKey = (target: SyncTargetDescriptor | null): string | null =>
    target ? `${target.type}:${target.id ?? ''}:${target.intervalMs ?? ''}` : null;

/**
 * Registers a sync target for the component lifetime and unregisters on cleanup.
 * `register` returns its own dispose fn, so the effect cleanup maps onto it directly.
 * Re-runs only when the target key changes (type/id/interval).
 */
export const useSyncTarget = (target: SyncTargetDescriptor | null): void => {
    const key = buildKey(target);

    useEffect(() => {
        if (!target) return;
        return getSyncManager().register(target);
        // key captures every field we re-register on; target is read once per key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
};

export const useChatSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'chat', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const useChannelSync = (channelId?: string, intervalMs?: number): void =>
    useSyncTarget(channelId ? { type: 'channel', id: channelId, ...(intervalMs ? { intervalMs } : {}) } : null);

export const usePlaceSync = (placeId?: string, intervalMs?: number): void =>
    useSyncTarget(placeId ? { type: 'place', id: placeId, ...(intervalMs ? { intervalMs } : {}) } : null);
