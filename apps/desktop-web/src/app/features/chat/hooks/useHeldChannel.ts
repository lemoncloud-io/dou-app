import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/runtime';

export const useHeldChannel = (
    resolved: DomainChannel | undefined,
    selectedChannelId: string | null,
    listLoading: boolean
): DomainChannel | undefined => {
    const [held, setHeld] = useState<DomainChannel | undefined>(resolved);
    useEffect(() => {
        if (resolved) setHeld(resolved);
        else if (!listLoading) setHeld(undefined);
    }, [resolved, listLoading]);

    if (resolved) return resolved;
    return listLoading && held && held.id === selectedChannelId ? held : undefined;
};
