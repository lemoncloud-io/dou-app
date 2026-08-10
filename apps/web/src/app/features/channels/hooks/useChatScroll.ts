import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { debounce } from '../../../utils';
import type { ClientChatView } from '../types';
import { stashRoomScroll, takeRoomScroll } from '../utils/roomScrollMemory';

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
     * Channel whose scroll offset is remembered across visits (see roomScrollMemory): restored on
     * mount when one was left behind, stashed again on unmount. Omit to always land at the bottom.
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
    const containerRef = useRef<HTMLDivElement>(null);
    // scrollTop captured just before an older page renders, restored once messages grows.
    const scrollPreserveRef = useRef<number | null>(null);
    // Where the list currently sits, mirrored out of the scroll event. The unmount stash below
    // reads THIS and not the container: React detaches host refs before it runs a parent's layout
    // effect cleanups, so by teardown `containerRef.current` is already null and the offset would
    // be gone. Programmatic scrolls fire the event too, so this tracks them as well.
    const lastScrollTopRef = useRef(0);
    // Read through a ref so flipping suppression does NOT re-run the auto-scroll effect: a re-run
    // right after a jump finishes would scroll to the bottom for messages that arrived while it
    // was suppressed, undoing the jump the moment it succeeded.
    const suppressAutoScrollRef = useRef(suppressAutoScroll);
    suppressAutoScrollRef.current = suppressAutoScroll;

    // An offset left behind by the last visit, waiting for the list to have rows to scroll through.
    // Carries its channel so a stale value can never be applied to a different room.
    const pendingRestoreRef = useRef<{ key: string; top: number } | null>(null);
    // Explicit null check, not `?.key === channelId`: with no pending restore AND no channelId
    // that comparison is `undefined === undefined`, which would claim a restore was pending and
    // silently disable the bottom pin for every caller that doesn't pass a channel.
    const hasPendingRestore = () => pendingRestoreRef.current !== null && pendingRestoreRef.current.key === channelId;

    useLayoutEffect(() => {
        if (!channelId) return;
        const saved = takeRoomScroll(channelId);
        if (saved !== null) pendingRestoreRef.current = { key: channelId, top: saved };

        // Hand the offset back on the way out, so the next entry into this room lands where the
        // reader left it instead of snapping to the newest message. Every exit unmounts the page,
        // so this one cleanup covers the thread hop, the back button and a push-driven jump alike.
        //
        // A claim that was never spent goes back untouched. The list only has rows to scroll a beat
        // after mount, so leaving before then — or StrictMode's mount/unmount/mount, which tears the
        // first pass down at exactly that point — would otherwise write the bottom (0) over the
        // offset this mount had just taken, and the reader's place would be gone.
        return () => {
            const unspent = pendingRestoreRef.current;
            const offset = unspent?.key === channelId ? unspent.top : lastScrollTopRef.current;
            stashRoomScroll(channelId, offset);
        };
    }, [channelId]);

    // Every programmatic move updates the mirror as well as the element: the scroll event that
    // would sync it is dispatched later, and an unmount in between must not stash a stale offset.
    const scrollToBottom = useCallback((smooth = false) => {
        requestAnimationFrame(() => {
            if (containerRef.current) {
                lastScrollTopRef.current = 0;
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
        lastScrollTopRef.current = scrollPreserveRef.current;
        scrollPreserveRef.current = null;
    }, [messages]);

    // Put the reader back where they were when they left the room, once the rows they were
    // reading exist again. The claim is NOT cleared here — layout effects run before passive
    // ones, so clearing now would re-open the bottom pin below in this very commit and undo the
    // scroll a frame later. The auto-scroll effect consumes it instead.
    useLayoutEffect(() => {
        const pending = pendingRestoreRef.current;
        if (!pending || pending.key !== channelId) return;
        const el = containerRef.current;
        if (!el || messages.length === 0) return;
        if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = pending.top;
            lastScrollTopRef.current = pending.top;
        }
    }, [messages, channelId]);

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
            if (messages.length > 0) pendingRestoreRef.current = null;
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
        const el = containerRef.current;
        if (el) lastScrollTopRef.current = el.scrollTop;
        debouncedLoadCheck();
    }, [debouncedLoadCheck]);

    return { containerRef, handleScroll: handleScrollEvent };
};
