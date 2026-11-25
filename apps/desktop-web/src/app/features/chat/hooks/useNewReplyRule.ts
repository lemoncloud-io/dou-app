import { useEffect, useMemo, useState } from 'react';

import type { DomainChat } from '@chatic/runtime-react';

import { useThreadStore } from '../stores';
import { isOwnMessage, type MessageViewer, type NewReplyRule } from '../utils';

const NOTHING_SEEN: ReadonlyMap<string, number> = new Map();

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
