import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useIsMutating } from '@tanstack/react-query';

import { logger } from '@chatic/bridges';
import { isInJoinWindow, runtime } from '@chatic/runtime-react';
import type { DomainChat } from '@chatic/runtime-react';

import { classifyWireError, extractErrorMessage } from '../../../shared';

export const REPLY_PAGES_PER_BATCH = 5;

export type ThreadRootStatus = 'found' | 'loading' | 'beforeJoin' | 'gone' | 'failed';

export type ThreadRepliesStatus = 'complete' | 'loadingOlder' | 'partial' | 'olderFailed';

interface ThreadRootArgs {
    channelId: string;
    rootId: string;
    windowRoot: DomainChat | undefined;
    joinedNo?: number;
    feedLoading: boolean;
    messages: DomainChat[];
    loadOlder: () => Promise<boolean>;
    hasMore: boolean;
    isLoadingOlder: boolean;
}

type RootOutcome =
    | { key: string; site: string; root: DomainChat }
    | { key: string; site: string; failure: 'gone' | 'failed' };

interface Pager {
    key: string;
    left: number;
    phase: 'running' | 'partial' | 'failed';
}

const freshPager = (key: string): Pager => ({ key, left: REPLY_PAGES_PER_BATCH, phase: 'running' });

const parseRootNo = (rootId: string): number => Number(rootId.slice(rootId.lastIndexOf(':') + 1));

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
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const site = selectedSiteId ?? '';
    const switching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    const rootNo = parseRootNo(rootId);
    const key = channelId && Number.isInteger(rootNo) && rootNo > 0 ? `${channelId}:${rootNo}` : null;
    const beforeJoin = key !== null && !isInJoinWindow({ chatNo: rootNo }, joinedNo);

    const [outcome, setOutcome] = useState<RootOutcome | null>(null);
    const mine = outcome?.key === key && ('root' in outcome || outcome.site === site) ? outcome : null;
    const shouldFetch = !windowRoot && !feedLoading && !switching && key !== null && !beforeJoin && !mine;

    useEffect(() => {
        if (!shouldFetch || !key) return;
        let cancelled = false;
        chatRepository.getChat({ id: key }).then(
            root => {
                if (!cancelled) setOutcome({ key, site, root });
            },
            (error: unknown) => {
                if (cancelled) return;
                const kind = classifyWireError(extractErrorMessage(error));
                logger.warn('CHAT', '[useThreadRoot] root fetch failed', { key, kind, error });
                setOutcome({ key, site, failure: kind === 'notFound' || kind === 'denied' ? 'gone' : 'failed' });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [chatRepository, key, site, shouldFetch]);

    const retryRoot = useCallback(() => setOutcome(null), []);

    const fetchedRoot = !windowRoot && mine && 'root' in mine ? mine.root : undefined;
    const root = windowRoot ?? fetchedRoot;

    let status: ThreadRootStatus;
    if (root) status = 'found';
    else if (key === null) status = 'gone';
    else if (beforeJoin) status = 'beforeJoin';
    else if (mine && 'failure' in mine) status = mine.failure;
    else status = 'loading';

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
            if (!ok && sent.current === request) setPager(current => ({ ...current, phase: 'failed' }));
        });
    }, [key, needsOlder, isLoadingOlder, oldestNo, pager, loadOlder]);

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
