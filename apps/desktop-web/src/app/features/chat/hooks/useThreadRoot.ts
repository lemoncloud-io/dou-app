import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';
import { isInJoinWindow } from '@chatic/data';
import type { DomainChat } from '@chatic/data';

import { runtime } from '@chatic/app-runtime';

import { classifyWireError, extractErrorMessage } from '../../../shared';

/**
 * How many older pages the panel pulls on its own before it stops and hands the next batch to the
 * reader. A page is `useChats`' `loadOlder` (50 messages), so a batch is a few hundred messages: enough
 * that an ordinary old thread completes untouched, small enough that a thread buried under thousands
 * of messages costs a handful of requests instead of a flood.
 */
export const REPLY_PAGES_PER_BATCH = 5;

/** Where the thread's root message stands. */
export type ThreadRootStatus =
    /** The root is in hand — from the loaded window or a single fetch. */
    | 'found'
    /** Waiting on the feed window, or on the fetch of a root that is not in it. */
    | 'loading'
    /** The root is from before my current membership: it never arrives, so nothing is asked. */
    | 'beforeJoin'
    /** The server says there is no such message, or that I may not read it. */
    | 'gone'
    /** The fetch failed for a reason that may pass (network, timeout). */
    | 'failed';

/** How complete the replies are. Only a root fetched from outside the window can be incomplete. */
export type ThreadRepliesStatus =
    /** Everything between the root and the newest message is loaded. */
    | 'complete'
    /** Older pages are being fetched, by the batch or by the reader's press. */
    | 'loadingOlder'
    /** A batch ran out before reaching the root: the reader decides whether to continue. */
    | 'partial'
    /** The last older page failed; what is already shown stays. */
    | 'olderFailed';

interface ThreadRootArgs {
    channelId: string;
    /** The root's `chatNo` string, or its full id (`<channelId>:<chatNo>`). */
    rootId: string;
    /** The root as found in the loaded window, if it is there. */
    windowRoot: DomainChat | undefined;
    /** The start of my current membership — messages at or before it are not mine to read. */
    joinedNo?: number;
    /** The feed window's own loading flag: a root is only "outside" once the window has settled. */
    feedLoading: boolean;
    /** The window's messages, oldest to newest. Their identity changes on every cache emission. */
    messages: DomainChat[];
    /** `useChats`' next-older-page fetch. Resolves false when that fetch failed. */
    loadOlder: () => Promise<boolean>;
    hasMore: boolean;
    isLoadingOlder: boolean;
}

type RootOutcome = { key: string; root: DomainChat } | { key: string; failure: 'gone' | 'failed' };

interface Pager {
    key: string;
    /** Older pages still allowed in the current batch. */
    left: number;
    phase: 'running' | 'partial' | 'failed';
}

const freshPager = (key: string): Pager => ({ key, left: REPLY_PAGES_PER_BATCH, phase: 'running' });

const parseRootNo = (rootId: string): number => Number(rootId.slice(rootId.lastIndexOf(':') + 1));

/**
 * Secures the root of the thread the panel shows, wherever it sits.
 *
 * The feed window holds only the newest messages, so a thread opened from a mention, a saved item or a
 * notification can have a root far below it. This hook asks the server for that one message by id
 * (`chat.get` — the feed has no thread filter) and then pages the feed down to it so the replies fill
 * in too. It asks for nothing while the root is already in the window.
 *
 * A root from before my join window is never requested: the number alone says the server will not
 * serve it, and asking would only leave a spinner. A fetched root is also written to the cache by the
 * repository; the feed observer reads only the newest rows, so it stays out of the channel's feed.
 */
export const useThreadRoot = ({
    channelId,
    rootId,
    windowRoot,
    joinedNo,
    feedLoading,
    messages,
    loadOlder,
    hasMore,
    isLoadingOlder,
}: ThreadRootArgs) => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();

    const rootNo = parseRootNo(rootId);
    const key = channelId && Number.isInteger(rootNo) && rootNo > 0 ? `${channelId}:${rootNo}` : null;
    const beforeJoin = key !== null && !isInJoinWindow({ chatNo: rootNo }, joinedNo);

    // Keyed by the root it answers, so a response that lands after the panel moved to another thread
    // or channel is never read as the new one's.
    const [outcome, setOutcome] = useState<RootOutcome | null>(null);
    const mine = outcome?.key === key ? outcome : null;
    const shouldFetch = !windowRoot && !feedLoading && key !== null && !beforeJoin && !mine;

    useEffect(() => {
        if (!shouldFetch || !key) return;
        let cancelled = false;
        chatRepository.getChat({ id: key }).then(
            root => {
                if (!cancelled) setOutcome({ key, root });
            },
            (error: unknown) => {
                if (cancelled) return;
                // Gone for good only when the server says so; anything else may pass, so it offers a retry.
                const kind = classifyWireError(extractErrorMessage(error));
                logger.warn('CHAT', '[useThreadRoot] root fetch failed', { key, kind, error });
                setOutcome({ key, failure: kind === 'notFound' || kind === 'denied' ? 'gone' : 'failed' });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [chatRepository, key, shouldFetch]);

    const retryRoot = useCallback(() => setOutcome(null), []);

    const fetchedRoot = !windowRoot && mine && 'root' in mine ? mine.root : undefined;
    const root = windowRoot ?? fetchedRoot;

    let status: ThreadRootStatus;
    if (root) status = 'found';
    else if (key === null) status = 'gone';
    else if (beforeJoin) status = 'beforeJoin';
    else if (mine && 'failure' in mine) status = mine.failure;
    else status = 'loading';

    // Replies: a root fetched from outside the window has everything between it and the window's
    // oldest message still to load. A root inside the window has all its replies already.
    const oldestNo = useMemo(() => {
        let oldest = Infinity;
        for (const chat of messages) {
            if (chat.chatNo != null && chat.chatNo > 0 && chat.chatNo < oldest) oldest = chat.chatNo;
        }
        return oldest;
    }, [messages]);
    const needsOlder = !!fetchedRoot && Number.isFinite(oldestNo) && oldestNo > rootNo && hasMore;

    const [pagerState, setPager] = useState<Pager>(() => freshPager(key ?? ''));
    const pager = pagerState.key === (key ?? '') ? pagerState : freshPager(key ?? '');
    // The last older page asked for, by the cursor it started from. The window re-reads the cache after
    // the fetch lands, and other writes re-emit it too (the fetched root, a live message, a reaction), so
    // "the window changed" says nothing about the page. A page that brought rows always moves the window's
    // oldest message down, so that is what says it has shown up. Not showing up is not an error: a failed
    // fetch reports itself through `loadOlder`.
    const sent = useRef<{ key: string; from: number } | null>(null);

    useEffect(() => {
        if (!key || !needsOlder || isLoadingOlder || pager.phase !== 'running') return;
        const last = sent.current?.key === key ? sent.current : null;
        if (last) {
            if (oldestNo >= last.from) return;
            if (pager.left === 0) {
                setPager({ ...pager, phase: 'partial' });
                return;
            }
        }
        const request = { key, from: oldestNo };
        sent.current = request;
        setPager({ ...pager, left: pager.left - 1 });
        loadOlder().then(ok => {
            // A failure that comes back after the panel moved on, or was asked again, is not this page's.
            if (!ok && sent.current === request) setPager(current => ({ ...current, phase: 'failed' }));
        });
    }, [key, needsOlder, isLoadingOlder, oldestNo, pager, loadOlder]);

    /** The reader's press on "load earlier replies": one more batch, or a retry of the page that failed. */
    const loadOlderReplies = useCallback(() => {
        if (!key) return;
        if (pager.phase === 'failed') sent.current = null;
        setPager(freshPager(key));
    }, [key, pager.phase]);

    let replies: ThreadRepliesStatus = 'loadingOlder';
    if (!needsOlder) replies = 'complete';
    else if (pager.phase === 'failed') replies = 'olderFailed';
    else if (pager.phase === 'partial') replies = 'partial';

    return { status, root, replies, retryRoot, loadOlderReplies };
};
