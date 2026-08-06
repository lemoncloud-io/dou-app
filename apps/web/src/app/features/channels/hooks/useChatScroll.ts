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
    /**
     * Measured border-box height of the floating composer (already includes the
     * `--keyboard-height` padding). Growing it is the only signal a native WebView gives when
     * the software keyboard opens, so it doubles as the re-pin trigger. Defaults to 0.
     */
    composerHeight?: number;
    /**
     * Suppresses the auto-scroll-to-bottom while another owner is positioning the view — today
     * that is a pending message jump (see docs/specs/search/message-jump.md). Without this the
     * two fight and the bottom pin always wins: `scrollToBottom` defers the actual scroll to a
     * `requestAnimationFrame`, which runs AFTER every effect in the flush, so it overwrites the
     * jump's synchronous `scrollIntoView`.
     */
    suppressAutoScroll?: boolean;
}

// In the reversed list scrollTop 0 is the bottom; anything within this slack still counts as
// "the user is reading the newest messages", so the view may be re-pinned under them.
const BOTTOM_PIN_SLACK_PX = 48;

/**
 * Scroll management for the reversed message list (`flex-col-reverse`: scrollTop 0 is the
 * bottom, negative is upward). Owns the scroll container ref and reconciles three behaviours:
 *  - Auto-scroll to the bottom when a genuinely new latest message arrives.
 *  - Preserve the viewport anchor across an older-page load (loadMore) — capture scrollTop
 *    before the new rows render, restore it in a layout effect after they do.
 *  - Trigger loadMore when scrolled near the top, debounced.
 *  - Re-pin to the bottom when the composer grows (software keyboard / multi-line input).
 *
 * Returns the container ref to attach to the list and the debounced scroll handler.
 */
export const useChatScroll = ({
    messages,
    hasMore,
    isLoadingMore,
    loadMore,
    inputRef,
    composerHeight = 0,
    suppressAutoScroll = false,
}: UseChatScrollParams) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // scrollTop captured just before an older page renders, restored once messages grows.
    const scrollPreserveRef = useRef<number | null>(null);
    // Read through a ref so flipping suppression does NOT re-run the auto-scroll effect: a re-run
    // right after a jump finishes would scroll to the bottom for messages that arrived while it
    // was suppressed, undoing the jump the moment it succeeded.
    const suppressAutoScrollRef = useRef(suppressAutoScroll);
    suppressAutoScrollRef.current = suppressAutoScroll;

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
        const hasNewLatest =
            messages.length > prevMessageCountRef.current && lastMessage?.id !== prevLastMessageIdRef.current;
        // Bookkeeping runs even while suppressed, so lifting suppression can never scroll for
        // messages that already landed during the jump.
        prevLastMessageIdRef.current = lastMessage?.id;
        prevMessageCountRef.current = messages.length;
        if (hasNewLatest && !suppressAutoScrollRef.current) {
            scrollToBottom(false);
        }
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

    // A native WebView does not fire `window.resize` when the software keyboard opens — the host
    // injects `--keyboard-height`, which surfaces only as the composer growing taller (and the
    // list's bottom padding growing with it). Re-pin on that growth so the newest message stays
    // reachable. Only when the view is already at the bottom, so scrolling back through history
    // isn't yanked away by a keyboard or a multi-line input.
    const prevComposerHeightRef = useRef(composerHeight);
    useEffect(() => {
        const previous = prevComposerHeightRef.current;
        prevComposerHeightRef.current = composerHeight;
        if (composerHeight <= previous) return;
        // The composer's first measurement (0 → measured) reads as growth, so this fires on mount
        // too — it must respect a pending jump like the auto-scroll above.
        if (suppressAutoScrollRef.current) return;

        const el = containerRef.current;
        if (!el || Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX) return;
        scrollToBottom();
    }, [composerHeight, scrollToBottom]);

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
