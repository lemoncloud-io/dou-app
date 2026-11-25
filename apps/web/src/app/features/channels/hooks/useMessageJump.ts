import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { isInJoinWindow } from '@chatic/runtime-react';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { isJumpTargetFor, useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import type { ClientChatView } from '../types';
import type { LoadMoreOptions } from './useChats';

const MAX_JUMP_PAGES = 8;
const HIGHLIGHT_MS = 2000;
const HIGHLIGHT_CLASSNAMES = [
    'relative',
    'isolate',
    "before:content-['']",
    'before:absolute',
    'before:inset-x-2',
    'before:-inset-y-1',
    'before:-z-10',
    'before:rounded-lg',
    'before:bg-primary/[0.08]',
    'before:pointer-events-none',
];

const added = new WeakMap<HTMLElement, string[]>();

const highlight = (node: HTMLElement, on: boolean) => {
    if (on) {
        const names = HIGHLIGHT_CLASSNAMES.filter(name => !node.classList.contains(name));
        node.classList.add(...names);
        added.set(node, [...(added.get(node) ?? []), ...names]);
    } else {
        node.classList.remove(...(added.get(node) ?? []));
        added.delete(node);
    }
    node.toggleAttribute('data-highlight', on);
};

interface UseMessageJumpParams {
    channelId: string;
    containerRef: RefObject<HTMLDivElement | null>;
    messages: ClientChatView[];
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: (options?: LoadMoreOptions) => void;
    canLoadMore?: boolean;
    loadUntil: (targetNo: number) => boolean;
    joinedNo?: number;
    threadRootNo?: string;
    onGiveUp?: () => void;
    isFetched?: (chatNo: number) => boolean;
    fetchThrough?: (chatNo: number) => Promise<boolean>;
}

export const useMessageJump = ({
    channelId,
    containerRef,
    messages,
    hasMore,
    isLoadingMore,
    loadMore,
    canLoadMore = true,
    loadUntil,
    joinedNo,
    threadRootNo,
    onGiveUp,
    isFetched,
    fetchThrough,
}: UseMessageJumpParams) => {
    const target = useMessageJumpStore(s => s.target);
    const clear = useMessageJumpStore(s => s.clear);
    const { t } = useTranslation();
    const progressRef = useRef<{ nonce: number; pages: number; done: boolean; askedOwnPage?: boolean } | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const onGiveUpRef = useRef(onGiveUp);
    onGiveUpRef.current = onGiveUp;

    useEffect(() => {
        if (!isJumpTargetFor(target, channelId, threadRootNo)) return;
        const container = containerRef.current;
        if (!container) return;

        if (progressRef.current?.nonce !== target.nonce) {
            progressRef.current = { nonce: target.nonce, pages: 0, done: false };
        }
        if (progressRef.current.done) return;

        if (!isInJoinWindow({ chatNo: target.chatNo }, joinedNo)) {
            progressRef.current.done = true;
            if (!target.quiet) toast({ title: t('chat.jumpOutsideJoinWindow') });
            clear();
            onGiveUpRef.current?.();
            return;
        }

        const node = container.querySelector<HTMLElement>(`[data-chat-no="${target.chatNo}"]`);
        if (node) {
            node.scrollIntoView({ block: target.block ?? 'center' });
            if (target.highlight !== false) {
                highlight(node, true);
                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                highlightTimerRef.current = setTimeout(() => highlight(node, false), HIGHLIGHT_MS);
            }
            progressRef.current.done = true;
            clear();
            return;
        }

        if (loadUntil(target.chatNo)) return;

        if (
            fetchThrough &&
            isFetched &&
            canLoadMore &&
            messages.length > 0 &&
            !progressRef.current.askedOwnPage &&
            !isFetched(target.chatNo)
        ) {
            progressRef.current.askedOwnPage = true;
            fetchThrough(target.chatNo).catch(() => undefined);
            return;
        }

        if (hasMore && !isLoadingMore && canLoadMore && progressRef.current.pages < MAX_JUMP_PAGES) {
            progressRef.current.pages += 1;
            loadMore({ immediate: true });
            return;
        }

        if (!isLoadingMore && (!hasMore || progressRef.current.pages >= MAX_JUMP_PAGES)) {
            progressRef.current.done = true;
            if (!target.quiet) toast({ title: t('search.messageJumpFailed') });
            clear();
            onGiveUpRef.current?.();
        }
    }, [
        target,
        channelId,
        messages,
        hasMore,
        isLoadingMore,
        loadMore,
        canLoadMore,
        loadUntil,
        containerRef,
        clear,
        t,
        joinedNo,
        threadRootNo,
        isFetched,
        fetchThrough,
    ]);

    useEffect(
        () => () => {
            if (isJumpTargetFor(useMessageJumpStore.getState().target, channelId, threadRootNo)) clear();
        },
        [channelId, threadRootNo, clear]
    );

    useEffect(
        () => () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        },
        []
    );
};
