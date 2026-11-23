import { useCallback, useEffect, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime, isEventChat, isInJoinWindow, type DomainChat } from '@chatic/runtime';

import { classifyWireError, extractErrorMessage, isNotifiableChat, threadRootNo } from '../../../shared';

export const THREAD_CARD_REPLIES = 3;
export const THREAD_CARD_PAGE = 200;

export type ThreadCardRootNotice = 'beforeJoin' | 'gone';

export type ThreadCardState =
    | { status: 'idle' | 'loading' | 'failed' }
    | {
          status: 'ready';
          root: DomainChat | null;
          rootNotice?: ThreadCardRootNotice;
          replies: DomainChat[];
          earlier: number | 'more';
      };

interface ThreadCardArgs {
    cid: string;
    channelId: string;
    rootNo: string;
    lastReplyNo: number;
    lastActivityAt: number;
    joinedNo?: number;
    enabled: boolean;
}

export const useThreadCard = ({
    cid,
    channelId,
    rootNo,
    lastReplyNo,
    lastActivityAt,
    joinedNo,
    enabled,
}: ThreadCardArgs) => {
    const [state, setState] = useState<ThreadCardState>({ status: 'idle' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        setState(previous => (previous.status === 'ready' ? previous : { status: 'loading' }));
        const { chat } = runtime.data.getCloudRepositories(cid);
        const rootId = `${channelId}:${rootNo}`;

        const readRoot = async (
            rows: DomainChat[]
        ): Promise<Pick<ThreadCardState & { status: 'ready' }, 'root' | 'rootNotice'>> => {
            const cached =
                rows.find(row => !row.parentId && String(row.chatNo) === rootNo) ?? (await chat.cacheRead(rootId));
            if (cached) return { root: cached };
            if (!isInJoinWindow({ chatNo: Number(rootNo) }, joinedNo)) return { root: null, rootNotice: 'beforeJoin' };
            try {
                const fetched = await chat.getChat({ id: rootId });
                return fetched ? { root: fetched } : { root: null, rootNotice: 'gone' };
            } catch (error) {
                const kind = classifyWireError(extractErrorMessage(error));
                if (kind === 'notFound' || kind === 'denied') return { root: null, rootNotice: 'gone' };
                throw error;
            }
        };

        void (async () => {
            try {
                const rows = (await chat.cacheReadList({ channelId, limit: THREAD_CARD_PAGE }))?.list ?? [];
                const replies = rows
                    .filter(
                        row =>
                            row.parentId &&
                            threadRootNo(row.parentId) === rootNo &&
                            !isEventChat(row) &&
                            isNotifiableChat(row)
                    )
                    .sort((a, b) => (a.chatNo ?? Infinity) - (b.chatNo ?? Infinity));
                const root = await readRoot(rows);
                if (!active) return;
                const earlierInWindow = Math.max(0, replies.length - THREAD_CARD_REPLIES);
                const truncated = rows.length >= THREAD_CARD_PAGE && lastReplyNo > 0;
                setState({
                    status: 'ready',
                    ...root,
                    replies: replies.slice(-THREAD_CARD_REPLIES),
                    earlier: truncated ? 'more' : earlierInWindow,
                });
            } catch (error) {
                logger.warn('CHAT', '[ThreadsPage] thread card unreadable', { error, data: { channelId, rootNo } });
                if (active) setState({ status: 'failed' });
            }
        })();
        return () => {
            active = false;
        };
    }, [cid, channelId, rootNo, lastReplyNo, lastActivityAt, joinedNo, enabled, attempt]);

    const retry = useCallback(() => setAttempt(n => n + 1), []);
    return { state, retry };
};
