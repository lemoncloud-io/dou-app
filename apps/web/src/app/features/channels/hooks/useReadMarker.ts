import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { readMarkRegistry } from '../../../runtime/logging/readMarkRegistry';

type MarkRead = (cid: string, input: { channelId: string; chatNo: number }) => Promise<void>;

interface UseReadMarkerParams {
    cid: string;
    channelId: string;
    channelChatNo?: number;
    lastChatNo?: number;
    markRead: MarkRead;
}

export const useReadMarker = ({ cid, channelId, channelChatNo, lastChatNo, markRead }: UseReadMarkerParams) => {
    const markedRef = useRef<{ room: string; chatNo: number } | null>(null);

    const mark = useCallback(
        (chatNo: number, failure: string) => {
            if (!channelId) return;
            const room = `${cid}|${channelId}`;
            const marked = markedRef.current;
            if (marked?.room === room && chatNo <= marked.chatNo) return;

            markedRef.current = { room, chatNo };
            markRead(cid, { channelId, chatNo })
                .then(() => readMarkRegistry.record(channelId, chatNo))
                .catch(error => {
                    logger.error('CHAT', failure, { error, data: { channelId, chatNo } });
                });
        },
        [channelId, cid, markRead]
    );

    useEffect(() => {
        if (!channelChatNo || document.visibilityState === 'hidden') return;
        mark(channelChatNo, 'Failed to read on channel entry');
    }, [channelChatNo, mark]);

    useEffect(() => {
        if (lastChatNo === undefined) return;

        const handleAutoRead = () => {
            if (document.visibilityState === 'hidden') return;
            mark(lastChatNo, 'Failed to read latest message');
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') handleAutoRead();
        };

        handleAutoRead();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [lastChatNo, mark]);

    const markSent = useCallback((chatNo: number) => mark(chatNo, 'Failed to read sent message'), [mark]);

    return { markSent };
};
