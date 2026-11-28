import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { stashScroll, useScrollRestoration } from '../../../hooks/useScrollRestoration';
import type { ClientChatView } from '../types';

interface UseChatScrollParams {
    messages: ClientChatView[];
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => void;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    composerHeight?: number;
    suppressAutoScroll?: boolean;
    holdBottomPin?: boolean;
    channelId?: string;
    readingHistoryRef?: { current: boolean };
    onReadingRow?: (chatNo: number) => void;
}

const BOTTOM_PIN_SLACK_PX = 48;

const PREFETCH_VIEWPORTS = 2;

const SCROLL_SETTLE_MS = 150;

const ANCHOR_PROBE_OFFSETS_PX = [0, 16, -16, 32];

export const useChatScroll = ({
    messages,
    hasMore,
    isLoadingMore,
    loadMore,
    inputRef,
    composerHeight = 0,
    suppressAutoScroll = false,
    holdBottomPin = false,
    channelId,
    readingHistoryRef,
    onReadingRow,
}: UseChatScrollParams) => {
    const onReadingRowRef = useRef(onReadingRow);
    onReadingRowRef.current = onReadingRow;
    const {
        containerRef,
        onScroll: restorationOnScroll,
        hasPendingRestore,
        consumePendingRestore,
    } = useScrollRestoration(channelId, messages.length > 0, { manualConsume: true });
    const suppressAutoScrollRef = useRef(suppressAutoScroll);
    suppressAutoScrollRef.current = suppressAutoScroll;
    const holdBottomPinRef = useRef(holdBottomPin);
    holdBottomPinRef.current = holdBottomPin;

    const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
    const lastScrollTopRef = useRef(0);
    const lastScrollAtRef = useRef(0);
    const assignedTopRef = useRef<number | null>(null);
    const anchorRef = useRef<{ node: Element; top: number } | null>(null);
    const drawnRef = useRef(false);
    const readerScrolledRef = useRef(false);
    const channelIdRef = useRef(channelId);

    useLayoutEffect(() => {
        channelIdRef.current = channelId;
        drawnRef.current = false;
        readerScrolledRef.current = false;
    }, [channelId]);

    const captureView = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        lastScrollTopRef.current = el.scrollTop;
        const away = Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX;
        if (readingHistoryRef) readingHistoryRef.current = away;
        setIsAwayFromBottom(away);
        anchorRef.current = null;
        if (typeof document.elementFromPoint !== 'function') return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        for (const offset of ANCHOR_PROBE_OFFSETS_PX) {
            const hit = document.elementFromPoint(x, rect.top + rect.height / 2 + offset);
            const row = hit && hit !== el && el.contains(hit) ? hit.closest('[data-chat-no]') : null;
            if (row && el.contains(row)) {
                anchorRef.current = { node: row, top: row.getBoundingClientRect().top };
                const chatNo = Number((row as HTMLElement).dataset.chatNo);
                if (Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX && chatNo > 0) onReadingRowRef.current?.(chatNo);
                return;
            }
        }
    }, [containerRef, readingHistoryRef]);

    const readerLeftBottom = useCallback(() => {
        const el = containerRef.current;
        return readerScrolledRef.current && !!el && Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX;
    }, [containerRef]);

    const pinToBottom = useCallback(
        (smooth: boolean, unless?: () => boolean) => {
            requestAnimationFrame(() => {
                if (unless?.()) return;
                if (containerRef.current) {
                    if (channelId) stashScroll(channelId, 0);
                    lastScrollTopRef.current = 0;
                    assignedTopRef.current = 0;
                    if (readingHistoryRef) readingHistoryRef.current = false;
                    setIsAwayFromBottom(false);
                    containerRef.current.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
                }
            });
        },
        [channelId, containerRef, readingHistoryRef]
    );

    const scrollToBottom = useCallback((smooth = false) => pinToBottom(smooth), [pinToBottom]);

    const landAtBottom = useCallback(() => {
        if (readerLeftBottom()) return;
        pinToBottom(false, () => channelIdRef.current !== channelId || readerLeftBottom());
    }, [channelId, pinToBottom, readerLeftBottom]);

    const holdView = useCallback(() => {
        const el = containerRef.current;
        const anchor = anchorRef.current;
        if (!el || !anchor || !el.contains(anchor.node)) return;
        if (performance.now() - lastScrollAtRef.current < SCROLL_SETTLE_MS) return;
        if (el.scrollTop !== lastScrollTopRef.current) return;
        const shift = anchor.node.getBoundingClientRect().top - anchor.top;
        if (Math.abs(shift) < 1) return;
        el.scrollTop += shift;
        assignedTopRef.current = el.scrollTop;
    }, [containerRef]);

    const prevLastMessageIdRef = useRef<string | undefined>(undefined);
    useLayoutEffect(() => {
        const lastMessage = messages[messages.length - 1];
        const previousLastId = prevLastMessageIdRef.current;
        prevLastMessageIdRef.current = lastMessage?.id;
        if (messages.length > 0) drawnRef.current = true;
        if (hasPendingRestore()) {
            if (messages.length > 0) {
                assignedTopRef.current = containerRef.current?.scrollTop ?? null;
                consumePendingRestore();
            }
            return;
        }
        if (!lastMessage || suppressAutoScrollRef.current) return;
        if (lastMessage.id === previousLastId) {
            if (previousLastId !== undefined && Math.abs(lastScrollTopRef.current) > BOTTOM_PIN_SLACK_PX) holdView();
            return;
        }
        const isFirstPage = previousLastId === undefined;
        if (!isFirstPage && !containsMessage(messages, previousLastId)) return;

        if (isFirstPage || lastMessage.isOwner || Math.abs(lastScrollTopRef.current) <= BOTTOM_PIN_SLACK_PX) {
            scrollToBottom(false);
            return;
        }
        holdView();
    }, [messages, scrollToBottom, holdView]);

    useLayoutEffect(() => {
        captureView();
    }, [messages, captureView]);

    useEffect(() => {
        const handleScrollAdjust = () =>
            setTimeout(() => {
                if (!suppressAutoScrollRef.current && !holdBottomPinRef.current) scrollToBottom();
            }, 150);
        const input = inputRef.current;

        window.addEventListener('resize', handleScrollAdjust);
        input?.addEventListener('focus', handleScrollAdjust);

        return () => {
            window.removeEventListener('resize', handleScrollAdjust);
            input?.removeEventListener('focus', handleScrollAdjust);
        };
    }, [inputRef, scrollToBottom]);

    const prevComposerHeightRef = useRef(composerHeight);
    useEffect(() => {
        const previous = prevComposerHeightRef.current;
        prevComposerHeightRef.current = composerHeight;
        if (composerHeight <= previous) return;
        if (suppressAutoScrollRef.current || holdBottomPinRef.current || hasPendingRestore()) return;

        const el = containerRef.current;
        if (!el || Math.abs(el.scrollTop) > BOTTOM_PIN_SLACK_PX) return;
        scrollToBottom();
    }, [composerHeight, scrollToBottom]);

    const checkLoadMore = useCallback(() => {
        const el = containerRef.current;
        if (!el || el.clientHeight === 0 || !hasMore || isLoadingMore) return;
        const remaining = el.scrollHeight - el.clientHeight - Math.abs(el.scrollTop);
        if (remaining < el.clientHeight * PREFETCH_VIEWPORTS) loadMore();
    }, [containerRef, hasMore, isLoadingMore, loadMore]);

    useEffect(() => {
        checkLoadMore();
    }, [messages, checkLoadMore]);

    const handleScrollEvent = useCallback(() => {
        restorationOnScroll();
        const el = containerRef.current;
        if (el && assignedTopRef.current !== null && el.scrollTop === assignedTopRef.current) {
            assignedTopRef.current = null;
        } else {
            lastScrollAtRef.current = performance.now();
            if (drawnRef.current) readerScrolledRef.current = true;
        }
        captureView();
        checkLoadMore();
    }, [restorationOnScroll, containerRef, captureView, checkLoadMore]);

    return {
        containerRef,
        handleScroll: handleScrollEvent,
        isAwayFromBottom,
        scrollToBottom,
        landAtBottom,
        hasPendingRestore,
    };
};

const containsMessage = (messages: ClientChatView[], id: string | undefined): boolean => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].id === id) return true;
    }
    return false;
};
