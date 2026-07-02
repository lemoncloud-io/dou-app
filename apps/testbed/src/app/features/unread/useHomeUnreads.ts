import { useMemo } from 'react';

import type { DomainChannel } from '@chatic/data';

import { computeUnreads } from './computeUnreads';
import type { UnreadAggregates } from './types';

export interface HomeUnreadsResult {
    aggregates: UnreadAggregates;
    channels: DomainChannel[];
}

/**
 * Derives the home-surface unread aggregates (per-channel / per-site / total) from the active
 * cloud's full channel list in one pass.
 *
 * No per-channel realtime registration here — that would cost one sync target per channel across
 * the whole cloud. It's unnecessary: `ChannelView` carries `$join`/`lastChat$`/`metaNo` inline, and
 * the cloud-wide `syncChannels` delta (polled by the home page) already refreshes those fields in
 * the cache for every channel. The active site's channels keep their realtime registration in
 * ChatHomePage; other sites refresh on that periodic delta — enough for the place/cloud presence
 * dots, which only need "has any unread".
 */
export const useHomeUnreads = (channels: DomainChannel[]): HomeUnreadsResult => {
    const aggregates = useMemo(() => computeUnreads(channels), [channels]);
    return { aggregates, channels };
};
