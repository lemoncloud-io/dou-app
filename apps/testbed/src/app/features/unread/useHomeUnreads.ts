import { useEffect, useMemo } from 'react';

import { getSyncManager } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { computeUnreads } from './computeUnreads';
import { registerChannels } from './registerChannels';
import type { UnreadAggregates } from './types';

export interface HomeUnreadsResult {
    aggregates: UnreadAggregates;
    channels: DomainChannel[];
}

/**
 * Home-surface unread counts across every site's channels.
 *
 * Observes the active cloud's full channel list, registers each channel to realtime sync so the
 * socket keeps its `$join`/`lastChat$` fresh (via SyncManager.registerChannel), and derives the
 * per-channel / per-site / total unread aggregates from those synced fields in one pass.
 */
export const useHomeUnreads = (channels: DomainChannel[]): HomeUnreadsResult => {
    // Stable dependency: only re-register when the set of channel ids actually changes, not on
    // every emit that leaves the ids unchanged (e.g. a lastChat update).
    const ids = useMemo(() => channels.map(ch => ch.id).sort(), [channels]);
    const idsKey = ids.join(',');

    useEffect(() => {
        const sync = getSyncManager();
        return registerChannels(ids, id => sync.registerChannel(id));
        // idsKey captures the id set; ids is derived from it in the same render.
    }, [idsKey]);

    const aggregates = useMemo(() => computeUnreads(channels), [channels]);

    return { aggregates, channels };
};
