import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/data';

/**
 * The channel a trailing panel is drawn for, kept through the moments the list cannot resolve it.
 *
 * The host resolves the selected channel by looking its id up in the loaded list, and that list is
 * replaced on a place switch (and empty before it first arrives). The selection has not changed in
 * those moments — the reader is still looking at the same channel — but the lookup finds nothing, and
 * a panel keyed on it would unmount and be rebuilt for the same room, fetching everything again. So
 * while the list is loading, the last channel resolved for the same id stands in. Once the list has
 * loaded, the lookup is the truth again: a channel that is not in it is gone. A different selection
 * never borrows another channel's object.
 */
export const useHeldChannel = (
    resolved: DomainChannel | undefined,
    selectedChannelId: string | null,
    listLoading: boolean
): DomainChannel | undefined => {
    const [held, setHeld] = useState<DomainChannel | undefined>(resolved);
    useEffect(() => {
        // A loaded list is the truth: what it lacks is gone, and must not come back with the next load.
        if (resolved) setHeld(resolved);
        else if (!listLoading) setHeld(undefined);
    }, [resolved, listLoading]);

    if (resolved) return resolved;
    return listLoading && held && held.id === selectedChannelId ? held : undefined;
};
