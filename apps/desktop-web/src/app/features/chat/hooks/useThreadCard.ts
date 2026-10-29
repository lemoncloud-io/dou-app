import { useCallback, useEffect, useState } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/app-runtime';
import { isInJoinWindow, type DomainChat } from '@chatic/data';

import { classifyWireError, extractErrorMessage, isNotifiableChat, threadRootNo } from '../../../shared';

/** How many of a thread's newest replies a Threads page card shows. */
export const THREAD_CARD_REPLIES = 3;
/** The cached window a card reads its replies from — the same depth the my-threads scan reads. */
export const THREAD_CARD_PAGE = 200;

/** Why a card has no root to show — the same verdicts, and words, as the thread panel's. */
export type ThreadCardRootNotice = 'beforeJoin' | 'gone';

export type ThreadCardState =
    | { status: 'idle' | 'loading' | 'failed' }
    | {
          status: 'ready';
          root: DomainChat | null;
          rootNotice?: ThreadCardRootNotice;
          replies: DomainChat[];
          /** Replies before the shown ones in the window; `'more'` when the window may cut the thread off. */
          earlier: number | 'more';
      };

interface ThreadCardArgs {
    cid: string;
    channelId: string;
    rootNo: string;
    /** The newest reply the my-threads record has seen — a change means there is more to read. */
    lastReplyNo: number;
    /** My current join, when the channel is loaded: a root before it is not shown, and not asked for. */
    joinedNo?: number;
    /** The card has come near the screen: nothing is read before. */
    enabled: boolean;
}

/**
 * The root and newest replies of one thread on the Threads page. Read from the chat cache of the
 * thread's own cloud (a channel id means nothing across clouds), the root fetched from the server only
 * when the cache does not hold it. Read again whenever the record's newest reply moves.
 */
export const useThreadCard = ({ cid, channelId, rootNo, lastReplyNo, joinedNo, enabled }: ThreadCardArgs) => {
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
            // The server windows reads by my join, so a root from before it can never arrive.
            if (!isInJoinWindow({ chatNo: Number(rootNo) }, joinedNo)) return { root: null, rootNotice: 'beforeJoin' };
            try {
                const fetched = await chat.getChat({ id: rootId });
                return fetched ? { root: fetched } : { root: null, rootNotice: 'gone' };
            } catch (error) {
                const kind = classifyWireError(extractErrorMessage(error));
                // Gone for good only when the server says so; anything else may pass, so it fails with a retry.
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
                            row.subType !== 'reaction' &&
                            isNotifiableChat(row)
                    )
                    .sort((a, b) => (a.chatNo ?? Infinity) - (b.chatNo ?? Infinity));
                const root = await readRoot(rows);
                if (!active) return;
                const earlierInWindow = Math.max(0, replies.length - THREAD_CARD_REPLIES);
                // A full window may stop short of the thread's first replies, so it cannot count them.
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
    }, [cid, channelId, rootNo, lastReplyNo, joinedNo, enabled, attempt]);

    const retry = useCallback(() => setAttempt(n => n + 1), []);
    return { state, retry };
};
