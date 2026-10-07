import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Direct path, not the `../../../hooks` barrel: that barrel re-exports hooks which pull in
// `@chatic/app-runtime` -> `@chatic/web-core`'s config module, which reads `import.meta.env` —
// syntax the CommonJS jest transform cannot parse. Same reasoning as `PlaceProfileForm`'s direct
// import of `PageHeader` (ADR-0046).
import { stashScroll, useScrollRestoration } from '../../../hooks/useScrollRestoration';
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
     * that is a pending message jump (apps/web/docs/feature/channels/chat-room.md). Without this the
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
    /**
     * Written here, read by `useChats`: whether the reader is away from the bottom, reading history.
     * That decides whether rows arriving may push the oldest rows out of the window (see `useChats`).
     */
    readingHistoryRef?: { current: boolean };
}

// In the reversed list scrollTop 0 is the bottom; anything within this slack still counts as
// "the user is reading the newest messages", so the view may be re-pinned under them.
const BOTTOM_PIN_SLACK_PX = 48;

// An older page is asked for once less than this many viewport heights of history are left above the
// reader. A page takes a few hundred milliseconds to come back on a device, so a request sent only at
// the top — which the old 200px threshold behind a trailing debounce amounted to — was a visible stall
// at the end of every page.
const PREFETCH_VIEWPORTS = 2;

// A reader whose last scroll event is more recent than this is still moving the list. Assigning
// scrollTop then stops iOS momentum dead, so the new-message correction below leaves them alone.
const SCROLL_SETTLE_MS = 150;

// Where to look for the row the reader is reading, relative to the list's centre. The centre can land
// in the 12px gap between two rows, so a miss is tried again a little lower and higher.
const ANCHOR_PROBE_OFFSETS_PX = [0, 16, -16, 32];

/**
 * Scroll management for the reversed message list (`flex-col-reverse`: scrollTop 0 is the
 * bottom, negative is upward). Owns the scroll container ref and reconciles these behaviours:
 *  - Follow a new latest message down to the bottom — but only for a reader who is at the bottom
 *    already, or who sent it. Someone reading history stays where they are.
 *  - Ask for an older page (loadMore) once less than two viewports of history are left above, checked
 *    on every scroll event and again after every commit that changes the list or the paging state,
 *    so a page that lands with the reader still inside that distance pulls the next one in by itself.
 *  - Leave the offset alone when an older page lands. Rows added at the top of a reversed list do
 *    not move what the reader sees, in Blink or WebKit.
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
    readingHistoryRef,
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
    // Read through a ref so flipping suppression does NOT re-run the auto-scroll effect: a re-run
    // right after a jump finishes would scroll to the bottom for messages that arrived while it
    // was suppressed, undoing the jump the moment it succeeded.
    const suppressAutoScrollRef = useRef(suppressAutoScroll);
    suppressAutoScrollRef.current = suppressAutoScroll;

    // Where the reader was before the current commit, recorded on every scroll event and again at the
    // end of every commit that changes the list. Reading the element during the commit instead is wrong
    // in Blink: its scroll anchoring has already moved scrollTop by the height of the row that just
    // arrived, so a reader 30px from the bottom would look as if they were reading history.
    const lastScrollTopRef = useRef(0);
    const lastScrollAtRef = useRef(0);
    // The offset this hook last assigned itself. Its scroll event is not the reader moving the list,
    // and stamped as one it would make the next arrival look mid-fling and go uncorrected.
    const assignedTopRef = useRef<number | null>(null);
    // A row the reader is looking at, and where it sat on screen at that same moment.
    const anchorRef = useRef<{ node: Element; top: number } | null>(null);

    const captureView = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        lastScrollTopRef.current = el.scrollTop;
        if (readingHistoryRef) readingHistoryRef.current = Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX;
        anchorRef.current = null;
        // Only a real layout engine can answer this, and only a real one needs the anchor.
        if (typeof document.elementFromPoint !== 'function') return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        // A row, not just anything inside the list: the wrapper of a date group, which a hit in the gap
        // between two rows returns, keeps its top when a row arrives at its bottom and another leaves
        // its top in the same commit — while the rows the reader is reading moved by a full row. The
        // room's rows carry `data-chat-no`, the same attribute a message jump finds them by.
        for (const offset of ANCHOR_PROBE_OFFSETS_PX) {
            const hit = document.elementFromPoint(x, rect.top + rect.height / 2 + offset);
            const row = hit && hit !== el && el.contains(hit) ? hit.closest('[data-chat-no]') : null;
            if (row && el.contains(row)) {
                anchorRef.current = { node: row, top: row.getBoundingClientRect().top };
                return;
            }
        }
    }, [containerRef, readingHistoryRef]);

    // Every programmatic move mirrors into the shared restoration memory directly, not by reading
    // the element back: `scrollTo` is a no-op stub in tests, and even in a real browser the native
    // 'scroll' event it triggers is asynchronous — an unmount before it fires would otherwise stash
    // a stale pre-scroll offset.
    const scrollToBottom = useCallback(
        (smooth = false) => {
            requestAnimationFrame(() => {
                if (containerRef.current) {
                    if (channelId) stashScroll(channelId, 0);
                    lastScrollTopRef.current = 0;
                    assignedTopRef.current = 0;
                    if (readingHistoryRef) readingHistoryRef.current = false;
                    containerRef.current.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
                }
            });
        },
        [channelId, containerRef, readingHistoryRef]
    );

    // Keeps a reader in history on the same rows when a message lands below them. Blink anchors the
    // scroll offset itself; WebKit leaves scrollTop where it was, so a row added at the bottom of the
    // reversed list pushes the view up by that row's height. Not while the reader is still moving the
    // list: there, a one-row creep costs less than stopping a fling.
    const holdView = useCallback(() => {
        const el = containerRef.current;
        const anchor = anchorRef.current;
        // The anchor has to still be part of the list: a row React replaced is no longer in it.
        if (!el || !anchor || !el.contains(anchor.node)) return;
        if (performance.now() - lastScrollAtRef.current < SCROLL_SETTLE_MS) return;
        // The offset already moved during this commit: the engine anchored the view itself (Blink). A
        // second correction on top would move the reader by however far its anchor and ours disagree.
        if (el.scrollTop !== lastScrollTopRef.current) return;
        const shift = anchor.node.getBoundingClientRect().top - anchor.top;
        if (Math.abs(shift) < 1) return;
        el.scrollTop += shift;
        assignedTopRef.current = el.scrollTop;
    }, [containerRef]);

    // A new latest message is told apart by the previous latest one still being in the list with
    // something after it — not by the list growing, because once the window is full a new message
    // pushes the oldest row out and the length stays the same. An older page leaves the latest
    // message where it was, so it never gets here.
    const prevLastMessageIdRef = useRef<string | undefined>(undefined);
    useLayoutEffect(() => {
        const lastMessage = messages[messages.length - 1];
        const previousLastId = prevLastMessageIdRef.current;
        // Bookkeeping runs even while suppressed, so lifting suppression can never scroll for
        // messages that already landed during the jump.
        prevLastMessageIdRef.current = lastMessage?.id;
        // A pending restore outranks the bottom pin — the first page of messages arriving IS a
        // "new latest message", so the pin would otherwise undo it. Consumed here, once the rows
        // exist, so the next message to arrive is handled like any other.
        if (hasPendingRestore()) {
            if (messages.length > 0) consumePendingRestore();
            return;
        }
        if (!lastMessage || lastMessage.id === previousLastId || suppressAutoScrollRef.current) return;
        const isFirstPage = previousLastId === undefined;
        // The previous latest message gone is a replacement or a removal — the confirmed row that
        // takes over an optimistic send, a deletion — not an arrival.
        if (!isFirstPage && !containsMessage(messages, previousLastId)) return;

        // Following the conversation down is for someone still at it: at the bottom already, or the
        // author of what just arrived. Pulling a reader out of history for everybody else's message
        // is what made scrolling back feel like the room kept reloading.
        if (isFirstPage || lastMessage.isOwner || Math.abs(lastScrollTopRef.current) <= BOTTOM_PIN_SLACK_PX) {
            scrollToBottom(false);
            return;
        }
        holdView();
    }, [messages, scrollToBottom, holdView]);

    // Re-read the view once the list has changed, so the next change is compared against what this
    // one left on screen. Declared after the effect above, which has to see the previous reading. Not
    // on every commit: the room re-renders on each keystroke in the composer, and a hit test plus a
    // forced layout per keystroke buys nothing — scroll events keep the reading current in between.
    useLayoutEffect(() => {
        captureView();
    }, [messages, captureView]);

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
        // A container that has not been laid out reads 0 for every size, which is not "near the top".
        if (!el || el.clientHeight === 0 || !hasMore || isLoadingMore) return;
        // In the reversed list |scrollTop| is the distance from the bottom, so this is the history
        // still above the viewport. A thread that does not fill the viewport has none, which pulls
        // older pages in until it does — there is no scroll gesture to wait for in that case, and
        // without this its older history could never be reached at all.
        const remaining = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
        if (remaining < el.clientHeight * PREFETCH_VIEWPORTS) loadMore();
    }, [containerRef, hasMore, isLoadingMore, loadMore]);

    // Checked again after every commit that changes the list or the paging state. A page that lands
    // with the reader still inside the prefetch distance — a fast fling outran it, or most of it was
    // reactions and replies the feed hides — has to bring the next one in without waiting for a scroll
    // event, which never comes if the reader has stopped. `checkLoadMore` changes with `isLoadingMore`
    // and `loadMore`, so this also runs when a page settles and when paging becomes possible again (a
    // socket verifying, a retry's wait ending).
    useEffect(() => {
        checkLoadMore();
    }, [messages, checkLoadMore]);

    // All of this runs on the scroll event itself, which arrives at most once a frame. The check used
    // to sit behind a trailing debounce, which never fired while the list was moving — a momentum
    // scroll included — so a page was only ever asked for once the reader had stopped at the top.
    const handleScrollEvent = useCallback(() => {
        restorationOnScroll();
        const el = containerRef.current;
        if (el && assignedTopRef.current !== null && el.scrollTop === assignedTopRef.current) {
            assignedTopRef.current = null;
        } else {
            lastScrollAtRef.current = performance.now();
        }
        captureView();
        checkLoadMore();
    }, [restorationOnScroll, containerRef, captureView, checkLoadMore]);

    return { containerRef, handleScroll: handleScrollEvent };
};

/** Whether `id` is in the list, scanned from the end — where a message that was the latest still sits. */
const containsMessage = (messages: ClientChatView[], id: string | undefined): boolean => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].id === id) return true;
    }
    return false;
};
