import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import type { ClientChatView } from '../types';

/** See docs/specs/search/message-jump.md — matches desktop-web's MessageList jump budget. */
const MAX_JUMP_PAGES = 8;
const HIGHLIGHT_MS = 1600;
const HIGHLIGHT_CLASSNAMES = ['bg-primary/10', 'transition-colors'];

interface UseMessageJumpParams {
    channelId: string;
    containerRef: RefObject<HTMLDivElement | null>;
    messages: ClientChatView[];
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
}

/**
 * Drives a pending `useMessageJumpStore` request for this channel: finds the target
 * message's `[data-chat-no]` DOM node and centers + flashes it. If it isn't loaded yet
 * (older than the current page), pages older — bounded by `MAX_JUMP_PAGES` — and the
 * `messages` dependency re-runs this as each page lands. Ported from desktop-web's
 * MessageList jump effect; here as a standalone hook since apps/web has no separate
 * ChatPane/MessageList split.
 */
export const useMessageJump = ({
    channelId,
    containerRef,
    messages,
    hasMore,
    isLoadingMore,
    loadMore,
}: UseMessageJumpParams) => {
    const target = useMessageJumpStore(s => s.target);
    const clear = useMessageJumpStore(s => s.clear);
    const { t } = useTranslation();
    const progressRef = useRef<{ nonce: number; pages: number; done: boolean } | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!target || target.channelId !== channelId) return;
        const container = containerRef.current;
        if (!container) return;

        // New request (or a repeat jump to the same message) → reset the paging budget.
        if (progressRef.current?.nonce !== target.nonce) {
            progressRef.current = { nonce: target.nonce, pages: 0, done: false };
        }
        // Already handled (landed or abandoned) — don't re-scroll on unrelated re-renders
        // that fire before the store clears the target.
        if (progressRef.current.done) return;

        const node = container.querySelector<HTMLElement>(`[data-chat-no="${target.chatNo}"]`);
        if (node) {
            node.scrollIntoView({ block: 'center' });
            node.classList.add(...HIGHLIGHT_CLASSNAMES);
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = setTimeout(() => node.classList.remove(...HIGHLIGHT_CLASSNAMES), HIGHLIGHT_MS);
            progressRef.current.done = true;
            clear();
            return;
        }

        // Not loaded yet → page older until found or the budget/history runs out.
        if (hasMore && !isLoadingMore && progressRef.current.pages < MAX_JUMP_PAGES) {
            progressRef.current.pages += 1;
            loadMore();
            return;
        }

        // Exhausted: no older history left or the budget was hit — stop re-firing and
        // tell the user rather than leaving them on an unrelated scroll position silently.
        if (!hasMore || progressRef.current.pages >= MAX_JUMP_PAGES) {
            progressRef.current.done = true;
            toast({ title: t('search.messageJumpFailed', '메시지를 찾을 수 없어요.') });
            clear();
        }
    }, [target, channelId, messages, hasMore, isLoadingMore, loadMore, containerRef, clear, t]);

    useEffect(
        () => () => {
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        },
        []
    );
};
