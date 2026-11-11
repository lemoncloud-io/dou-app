import { useEffect, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';

import { THREAD_CARD_PAGE } from './useThreadCard';

/**
 * The reaction events in a channel's cached window, for a page card (Threads, Saved) to fold into chips.
 *
 * Reactions are their own chats, so a card's one-off read of its messages would miss a toggle: a reaction
 * moves nothing a card reads again on. Watching the window keeps the chips current, the card's own
 * presses included.
 *
 * `includeUnsent`, as the chat feed asks: my reaction is a `chat_no: 0` row until the server answers, and
 * without the flag a full window drops it, so the chip would wait for the echo. A reaction whose event
 * has left the window is not seen.
 */
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
