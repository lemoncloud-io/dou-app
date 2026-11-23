import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';

import { useCloudPushBadgeStore } from '../stores';

export const useRetainLeavingCloudBadge = (unreadTotal: number): void => {
    const session = runtime.session.useGlobalSession();
    const cloudId = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : null;
    const mark = useCloudPushBadgeStore(s => s.mark);
    const prev = useRef<{ id: string | null; unread: number }>({ id: null, unread: 0 });

    useEffect(() => {
        const { id, unread } = prev.current;
        if (id && id !== cloudId && unread > 0) mark(id);
        prev.current = { id: cloudId, unread: unreadTotal };
    }, [cloudId, unreadTotal, mark]);
};
