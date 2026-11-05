import { useEffect, useMemo, useState } from 'react';

import type { DomainChat } from '@chatic/data';

import { useThreadStore } from '../stores';
import { isOwnMessage, type MessageViewer, type NewReplyRule } from '../utils';

const NOTHING_SEEN: ReadonlyMap<string, number> = new Map();

/**
 * The rule the open channel's thread footers mark new replies by: above the read cursor the channel
 * opened with, not mine, and not yet shown in the thread panel.
 *
 * Opening a thread marks it seen up to the newest message loaded in the channel. The panel shows every
 * loaded reply of its root, so anything at or below that number has been on screen; a reply arriving
 * while the panel stays open raises the number with it. What a thread has shown is forgotten when the
 * channel changes, together with the cursor it was measured from.
 */
export const useNewReplyRule = (
    channelId: string | null,
    messages: readonly DomainChat[],
    readNo: number,
    viewer: MessageViewer
): NewReplyRule => {
    const openRootId = useThreadStore(s => (s.openChannelId === channelId ? s.openRootId : null));
    const [seen, setSeen] = useState<{ channelId: string | null; byRoot: ReadonlyMap<string, number> }>({
        channelId,
        byRoot: NOTHING_SEEN,
    });
    const stored = seen.channelId === channelId ? seen.byRoot : NOTHING_SEEN;

    const loadedHead = useMemo(() => messages.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0), [messages]);
    const openFloor = openRootId ? Math.max(stored.get(openRootId) ?? 0, loadedHead) : 0;
    // The open thread's floor is worked out here, in the same render as the reply that raised it, so a
    // reply landing in an open panel never shows as new for a frame. The state only keeps the floor
    // once the panel closes.
    const seenByRoot = useMemo(
        () => (openRootId ? new Map(stored).set(openRootId, openFloor) : stored),
        [stored, openRootId, openFloor]
    );
    useEffect(() => {
        if (!openRootId || openFloor <= (stored.get(openRootId) ?? 0)) return;
        setSeen({ channelId, byRoot: new Map(stored).set(openRootId, openFloor) });
    }, [channelId, openRootId, openFloor, stored]);

    return useMemo(
        () => ({ readNo, seenByRoot, isMine: (chat: DomainChat) => isOwnMessage(chat, viewer) }),
        [readNo, seenByRoot, viewer]
    );
};
