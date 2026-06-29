import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { debounce } from '../../../utils';
import type { ClientChatView } from '../types';

interface UseChatScrollParams {
    messages: ClientChatView[];
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
    // Owned by the page (textarea), passed in so focus can re-anchor the view.
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Scroll management for the reversed message list (`flex-col-reverse`: scrollTop 0 is the
 * bottom, negative is upward). Owns the scroll container ref and reconciles three behaviours:
 *  - Auto-scroll to the bottom when a genuinely new latest message arrives.
 *  - Preserve the viewport anchor across an older-page load (loadMore) — capture scrollTop
 *    before the new rows render, restore it in a layout effect after they do.
 *  - Trigger loadMore when scrolled near the top, debounced.
 *
 * Returns the container ref to attach to the list and the debounced scroll handler.
 */
export const useChatScroll = ({ messages, hasMore, isLoadingMore, loadMore, inputRef }: UseChatScrollParams) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // scrollTop captured just before an older page renders, restored once messages grows.
    const scrollPreserveRef = useRef<number | null>(null);

    const scrollToBottom = useCallback((smooth = false) => {
        requestAnimationFrame(() => {
            if (containerRef.current) {
                containerRef.current.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
            }
        });
    }, []);

    // Restore the pre-loadMore anchor after the older page renders, before the browser paints.
    // Adding content at the top keeps the same view when scrollTop is restored against the
    // bottom-anchored reverse layout.
    useLayoutEffect(() => {
        if (scrollPreserveRef.current === null) return;
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = scrollPreserveRef.current;
        scrollPreserveRef.current = null;
    }, [messages]);

    // Auto-scroll to the bottom only when the latest message is new (not on older-page loads,
    // which grow the list at the top without changing the last message id).
    const prevMessageCountRef = useRef(messages.length);
    const prevLastMessageIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (messages.length > prevMessageCountRef.current && lastMessage?.id !== prevLastMessageIdRef.current) {
            scrollToBottom(false);
        }
        prevLastMessageIdRef.current = lastMessage?.id;
        prevMessageCountRef.current = messages.length;
    }, [messages.length, scrollToBottom]);

    // Keep the view pinned to the bottom across viewport changes (keyboard, resize, input focus).
    useEffect(() => {
        const handleScrollAdjust = () => setTimeout(() => scrollToBottom(), 150);
        const input = inputRef.current;

        window.addEventListener('resize', handleScrollAdjust);
        input?.addEventListener('focus', handleScrollAdjust);

        return () => {
            window.removeEventListener('resize', handleScrollAdjust);
            input?.removeEventListener('focus', handleScrollAdjust);
        };
    }, [inputRef, scrollToBottom]);

    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el || !hasMore || isLoadingMore) return;

        // Avoid an infinite-load loop when the content doesn't fill the viewport.
        if (el.scrollHeight <= el.clientHeight) return;

        const distanceFromTop = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
        if (distanceFromTop < 200) {
            scrollPreserveRef.current = el.scrollTop;
            loadMore();
        }
    }, [hasMore, isLoadingMore, loadMore]);

    // Read the latest handleScroll through a ref so the debounced instance is created once —
    // recreating it would orphan its pending timer.
    const handleScrollRef = useRef(handleScroll);
    handleScrollRef.current = handleScroll;

    const debouncedHandleScroll = useMemo(() => debounce(() => handleScrollRef.current(), 100), []);

    return { containerRef, debouncedHandleScroll };
};
