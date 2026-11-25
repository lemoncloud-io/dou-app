import { useEffect, useState } from 'react';

import { runtime } from '@chatic/runtime-react';
import type { DomainChat } from '@chatic/runtime-react';

import { THREAD_CARD_PAGE } from './useThreadCard';

export const useCardReactionEvents = (cid: string, channelId: string, enabled: boolean): DomainChat[] => {
    const [events, setEvents] = useState<DomainChat[]>([]);
    useEffect(() => {
        if (!enabled || !channelId) return;
        const { chat } = runtime.data.getCloudRepositories(cid);
        return chat.observeList({ channelId, limit: THREAD_CARD_PAGE, includeUnsent: true }, result => {
            setEvents((result?.list ?? []).filter(row => row.subType === 'reaction'));
        });
    }, [cid, channelId, enabled]);
    return events;
};
