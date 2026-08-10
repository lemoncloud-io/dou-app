import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

// Direct path, not the `../../../hooks` barrel: that barrel re-exports hooks which pull in
// `@chatic/app-runtime` -> `@chatic/web-core`'s config module, which reads `import.meta.env` —
// syntax the CommonJS jest transform cannot parse. Same reasoning as `PlaceProfileForm`'s direct
// import of `PageHeader` (ADR-0046).
import { stashScroll, useScrollRestoration } from '../../../hooks/useScrollRestoration';
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
    /**
     * Channel whose scroll offset is remembered across visits (see `useScrollRestoration`):
     * restored on mount when one was left behind, stashed again on unmount. Omit to always land
     * at the bottom.
     */
    channelId?: string;
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
 *  - Remember the offset on unmount and restore it on the next entry, so re-opening a room lands
 *    where the reader left it.
 *
 * Returns the container ref to attach to the list and the list's scroll handler.
 */
export const useChatScroll = ({
    messages,
    hasMore,
    isLoadingMore,
    loadMore,
    inputRef,
    composerHeight = 0,
    suppressAutoScroll = false,
    channelId,
}: UseChatScrollParams) => {
    // The channel-scoped slice of the shared scroll-restoration hook (see `useScrollRestoration`):
    // it owns the container ref, the take-on-mount/stash-on-unmount memory, and the pending-claim
    // bookkeeping. `manualConsume` because the bottom pin below is a competing scroll behaviour —
    // it has to defer to `hasPendingRestore` for one commit and consume the claim itself, rather
    // than having it cleared out from under it.
    const {
        containerRef,
        onScroll: restorationOnScroll,
        hasPendingRestore,
        consumePendingRestore,
    } = useScrollRestoration(channelId, messages.length > 0, { manualConsume: true });
    // scrollTop captured just before an older page renders, restored once messages grows.
    const scrollPreserveRef = useRef<number | null>(null);
    // Read through a ref so flipping suppression does NOT re-run the auto-scroll effect: a re-run
    // right after a jump finishes would scroll to the bottom for messages that arrived while it
    // was suppressed, undoing the jump the moment it succeeded.
    const suppressAutoScrollRef = useRef(suppressAutoScroll);
    suppressAutoScrollRef.current = suppressAutoScroll;

    // Every programmatic move mirrors into the shared restoration memory directly, not by reading
    // the element back: `scrollTo` is a no-op stub in tests, and even in a real browser the native
    // 'scroll' event it triggers is asynchronous — an unmount before it fires would otherwise stash
    // a stale pre-scroll offset.
    const scrollToBottom = useCallback(
        (smooth = false) => {
            requestAnimationFrame(() => {
                if (containerRef.current) {
                    if (channelId) stashScroll(channelId, 0);
                    containerRef.current.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
                }
            });
        },
        [channelId, containerRef]
    );

    // Restore the pre-loadMore anchor after the older page renders, before the browser paints.
    // Adding content at the top keeps the same view when scrollTop is restored against the
    // bottom-anchored reverse layout.
    useLayoutEffect(() => {
        if (scrollPreserveRef.current === null) return;
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = scrollPreserveRef.current;
        if (channelId) stashScroll(channelId, scrollPreserveRef.current);
        scrollPreserveRef.current = null;
    }, [messages, channelId, containerRef]);

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
        // A pending restore outranks the bottom pin — the first page of messages arriving IS a
        // "new latest message", so the pin would otherwise undo it. Consumed here, once the rows
        // exist, so the NEXT message to arrive follows the bottom again like any other.
        if (hasPendingRestore()) {
            if (messages.length > 0) consumePendingRestore();
            return;
        }
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
        if (suppressAutoScrollRef.current || hasPendingRestore()) return;

        const el = containerRef.current;
        if (!el || Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX) return;
        scrollToBottom();
    }, [composerHeight, scrollToBottom]);

    const checkLoadMore = useCallback(() => {
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

    // Read the latest checkLoadMore through a ref so the debounced instance is created once —
    // recreating it would orphan its pending timer.
    const checkLoadMoreRef = useRef(checkLoadMore);
    checkLoadMoreRef.current = checkLoadMore;

    const debouncedLoadCheck = useMemo(() => debounce(() => checkLoadMoreRef.current(), 100), []);

    // The offset is recorded synchronously and only the load-more check is debounced: leaving the
    // room inside the debounce window would otherwise stash an offset up to 100ms out of date —
    // and leaving mid-scroll is exactly when the reader cares where they were.
    const handleScrollEvent = useCallback(() => {
        restorationOnScroll();
        debouncedLoadCheck();
    }, [restorationOnScroll, debouncedLoadCheck]);

    return { containerRef, handleScroll: handleScrollEvent };
};
