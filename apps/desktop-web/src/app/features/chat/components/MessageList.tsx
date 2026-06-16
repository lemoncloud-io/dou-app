import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, MessageSquare } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

import { Skeleton, resolveDisplay, useSiteProfileMap } from '../../../shared';
import { buildMessageRows, isOwnMessage, type MessageViewer, type ThreadMeta } from '../utils';
import { DateSeparator } from './DateSeparator';
import { MessageRow, type ThreadMetaView } from './MessageRow';

interface MessageListProps {
    messages: DomainChat[];
    isLoading: boolean;
    viewer: MessageViewer;
    /** channel member id → display name, used to name authors when owner$ is absent. */
    names?: ReadonlyMap<string, string>;
    /** Member roster still loading — render a name skeleton instead of "Unknown". */
    membersLoading?: boolean;
    /** Read position when the channel was opened — drives the "new messages" divider. */
    baselineReadNo?: number;
    /** Thread panel only: total replies under the root — renders an "N replies" divider. */
    threadReplyCount?: number;
    onRetry?: (message: DomainChat) => void;
    /** Remove an unsent (failed / stuck-pending) message from the local cache. */
    onDiscard?: (message: DomainChat) => void;
    /** Fetch older history when the reader scrolls near the top. */
    onLoadOlder?: () => void;
    hasMore?: boolean;
    isLoadingOlder?: boolean;
    /** Increment to force a jump to the latest message (e.g. after you send). */
    scrollSignal?: number;
    /** root id → loaded reply aggregate; root rows render a thread footer. */
    threadMeta?: ReadonlyMap<string, ThreadMeta>;
    /** Open a thread; wired only for the main channel feed (not the thread panel). */
    onOpenThread?: (rootId: string) => void;
    /** Scroll a specific message into view + flash it (saved-item / search jump). */
    jumpTarget?: { chatNo: number; nonce: number };
    /** Called once a jump is consumed (landed or abandoned) so the store can clear. */
    onJumpConsumed?: () => void;
}

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 120;
/** Bound how many older pages a jump will fetch before giving up on the target. */
const MAX_JUMP_PAGES = 8;
/** Slack-style thread footer shows at most this many replier avatars. */
const MAX_FOOTER_REPLIERS = 3;
/** Linger before the "New messages" divider clears, so the dismiss is seen first. */
const DIVIDER_CLEAR_DELAY_MS = 1000;
/** Fade-out duration once the linger elapses (matches the transition class below). */
const DIVIDER_FADE_MS = 300;

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

export const MessageList = ({
    messages,
    isLoading,
    viewer,
    names,
    membersLoading,
    baselineReadNo,
    threadReplyCount,
    onRetry,
    onDiscard,
    onLoadOlder,
    hasMore,
    isLoadingOlder,
    scrollSignal,
    threadMeta,
    onOpenThread,
    jumpTarget,
    onJumpConsumed,
}: MessageListProps) => {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [atBottom, setAtBottom] = useState(true);
    // When a prepend (older page) is in flight, remember the scroll metrics so we
    // can keep the viewport anchored instead of jumping to the top.
    const prependRef = useRef<{ pending: boolean; prevHeight: number; prevTop: number }>({
        pending: false,
        prevHeight: 0,
        prevTop: 0,
    });
    const prevLenRef = useRef(0);
    // Highest chatNo the reader has actually reached (at bottom) — newer than this
    // while scrolled up counts as "new" on the jump button.
    const seenMaxRef = useRef(0);
    const [newCount, setNewCount] = useState(0);
    // On the channel's first fill, land at the unread divider (if any) instead of
    // the bottom. Reset per channel via the key={channelId} remount.
    const unreadRef = useRef<HTMLDivElement>(null);
    const didInitRef = useRef(false);
    // The "New messages" divider sits above the first message newer than what the
    // reader has actually seen. seenUpTo advances to the latest while the reader is
    // at the bottom AND the window is focused (messages read live) and freezes when
    // they scroll up or blur — so the divider marks only messages that arrived
    // while they were away, and clears once they return to the bottom.
    const [seenUpTo, setSeenUpTo] = useState(baselineReadNo ?? 0);
    // Saved-item / search jump: chatNo currently flashing, plus the per-request
    // paging budget and the flash timer.
    const [highlightChatNo, setHighlightChatNo] = useState<number | null>(null);
    const jumpRef = useRef<{ nonce: number; pages: number; done: boolean } | null>(null);
    const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const placeProfiles = useSiteProfileMap();
    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount),
        [messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount]
    );

    // Resolve thread repliers for the footer avatar stack the same way message
    // authors resolve: Place Profile override → roster name → viewer (own replies,
    // whose ownerId may be either the account or cloud id — see isOwnMessage).
    const threadMetaView = useMemo(() => {
        if (!threadMeta) return undefined;
        const view = new Map<string, ThreadMetaView>();
        for (const [rootKey, meta] of threadMeta) {
            const repliers = meta.repliers.slice(0, MAX_FOOTER_REPLIERS).map(replier => {
                const isMine = replier.id === viewer.uid || (!!viewer.cloudUid && replier.id === viewer.cloudUid);
                const place = isMine
                    ? ((viewer.cloudUid ? placeProfiles[viewer.cloudUid] : undefined) ??
                      (viewer.uid ? placeProfiles[viewer.uid] : undefined))
                    : placeProfiles[replier.id];
                const fallbackName = isMine ? viewer.name : (names?.get(replier.id) ?? '');
                const display = resolveDisplay(place, fallbackName, replier.thumbnail);
                return {
                    key: replier.id,
                    name: display.name,
                    thumbnail: display.thumbnail,
                    colorSeed: isMine ? viewer.cloudUid || viewer.uid || replier.id : replier.id,
                };
            });
            view.set(rootKey, { count: meta.count, lastReplyAt: meta.lastReplyAt, repliers });
        }
        return view;
    }, [threadMeta, names, placeProfiles, viewer]);

    // Lowercased "me" names for self-mention highlighting (profile name +
    // place nick under either of my ids — mirrors the notification filter).
    const selfNames = useMemo(() => {
        const names = [
            viewer.name,
            viewer.cloudUid ? placeProfiles[viewer.cloudUid]?.nick : undefined,
            viewer.uid ? placeProfiles[viewer.uid]?.nick : undefined,
        ];
        return names.filter((n): n is string => !!n?.trim()).map(n => n.trim().toLowerCase());
    }, [viewer, placeProfiles]);

    // Highest PERSISTED chatNo: exclude optimistic/pending rows (sentinel
    // Number.MAX_SAFE_INTEGER) so a seenUpTo advance never jumps to MAX and
    // suppresses every later divider for this mount (mirrors useReadReceipts).
    const maxChatNo = useMemo(
        () =>
            messages.reduce(
                (m, c) =>
                    !c.isPending && c.chatNo && c.chatNo !== Number.MAX_SAFE_INTEGER && c.chatNo > m ? c.chatNo : m,
                0
            ),
        [messages]
    );
    // Keep the latest max in a ref so the send effect can clear the divider
    // without taking maxChatNo as a dep (it changes on every tail update, which
    // would re-trigger the post-send snap animation).
    const maxChatNoRef = useRef(maxChatNo);
    maxChatNoRef.current = maxChatNo;
    // Dismiss the divider on a short delay so it lingers long enough to register
    // before vanishing. Coalesced (a new schedule resets the timer); leaving the
    // bottom cancels it. Fires to the latest real chatNo at timeout.
    const dividerClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dividerFading, setDividerFading] = useState(false);
    const scheduleDividerClear = () => {
        if (dividerClearTimer.current) clearTimeout(dividerClearTimer.current);
        // Linger, then fade out, then actually drop the row (advance the baseline).
        dividerClearTimer.current = setTimeout(() => {
            setDividerFading(true);
            dividerClearTimer.current = setTimeout(() => {
                setSeenUpTo(prev => Math.max(prev, maxChatNoRef.current));
                setDividerFading(false);
            }, DIVIDER_FADE_MS);
        }, DIVIDER_CLEAR_DELAY_MS);
    };
    const cancelDividerClear = () => {
        if (dividerClearTimer.current) {
            clearTimeout(dividerClearTimer.current);
            dividerClearTimer.current = null;
        }
        // Scrolled back up mid-fade — restore the divider (fades back in).
        setDividerFading(false);
    };

    // A late $join can raise the open-time baseline after mount — lift the
    // divider's floor to match so it anchors at the right place.
    useEffect(() => {
        setSeenUpTo(prev => Math.max(prev, baselineReadNo ?? 0));
    }, [baselineReadNo]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        const grew = messages.length > prevLenRef.current;
        const firstFill = prevLenRef.current === 0 && messages.length > 0;
        prevLenRef.current = messages.length;
        // Recompute the unread-while-scrolled-up count here (not in render) so it
        // only changes with messages/atBottom — not on every scroll tick. Own
        // messages never count.
        if (atBottom) {
            seenMaxRef.current = maxChatNo;
            setNewCount(0);
        } else {
            setNewCount(
                messages.reduce(
                    (n, c) => ((c.chatNo ?? 0) > seenMaxRef.current && !isOwnMessage(c, viewer) ? n + 1 : n),
                    0
                )
            );
        }
        if (!el) return;
        // Older page prepended → restore the prior viewport offset.
        if (prependRef.current.pending) {
            el.scrollTop = el.scrollHeight - prependRef.current.prevHeight + prependRef.current.prevTop;
            prependRef.current.pending = false;
            return;
        }
        // First fill of this channel: land on the unread divider if there is one,
        // otherwise the bottom. Subsequent updates use the follow-below logic.
        if (firstFill && !didInitRef.current) {
            didInitRef.current = true;
            if (unreadRef.current) unreadRef.current.scrollIntoView({ block: 'center' });
            else bottomRef.current?.scrollIntoView({ block: 'end' });
            return;
        }
        // New tail message while pinned to bottom → follow it. Setting scrollTop
        // directly is reliable here; scrollIntoView on the 0-height bottom anchor
        // lands a message-height short in this flex column.
        if (grew && atBottom) {
            el.scrollTop = el.scrollHeight;
            // Read live: a message that lands while you're at the bottom + focused
            // never raises a sticky divider.
            if (isWindowActive()) setSeenUpTo(prev => Math.max(prev, maxChatNo));
        }
    }, [messages, atBottom, maxChatNo, viewer]);

    // After sending, snap to the latest even if the reader had scrolled up. A
    // single scroll lands short: the optimistic message renders, then the list
    // reflows over the next few frames (optimistic→server swap, height change),
    // each nudging the viewport off the bottom. Pin to the bottom every frame for
    // a short window so it rides through all of them.
    useEffect(() => {
        if (!scrollSignal) return;
        setAtBottom(true);
        // Sending means you're caught up — clear the "New messages" divider after
        // a short linger (advances to the latest real chatNo at timeout).
        scheduleDividerClear();
        // Pin to the bottom every frame for a short window: a single scroll lands
        // short because the list keeps reflowing after the send (optimistic message
        // render, optimistic→server swap, height change), each nudging the viewport
        // off the bottom. Pinning the whole window rides through all of them.
        const deadline = performance.now() + 600;
        let raf = 0;
        const snap = () => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            if (performance.now() < deadline) raf = requestAnimationFrame(snap);
        };
        raf = requestAnimationFrame(snap);
        return () => cancelAnimationFrame(raf);
    }, [scrollSignal]);

    // Drive a jump request: center the target message's DOM node and flash it.
    // If it isn't loaded (older than the live page), page older — bounded — and
    // the `messages` dependency re-runs this as each page lands.
    useEffect(() => {
        if (!jumpTarget) return;
        const el = scrollRef.current;
        if (!el) return;
        // New request → reset the paging budget + done latch.
        if (jumpRef.current?.nonce !== jumpTarget.nonce) {
            jumpRef.current = { nonce: jumpTarget.nonce, pages: 0, done: false };
        }
        // Already handled (landed or abandoned) — don't re-scroll on live-tail ticks
        // that re-run this effect before the store clears the target.
        if (jumpRef.current.done) return;
        const node = el.querySelector<HTMLElement>(`[data-chat-no="${jumpTarget.chatNo}"]`);
        if (node) {
            node.scrollIntoView({ block: 'center' });
            setHighlightChatNo(jumpTarget.chatNo);
            if (highlightTimer.current) clearTimeout(highlightTimer.current);
            highlightTimer.current = setTimeout(() => setHighlightChatNo(null), 1600);
            jumpRef.current.done = true;
            onJumpConsumed?.();
            return;
        }
        // Not loaded yet → page older until found or the budget/history runs out.
        if (hasMore && !isLoadingOlder && jumpRef.current.pages < MAX_JUMP_PAGES) {
            jumpRef.current.pages += 1;
            onLoadOlder?.();
            return;
        }
        // Exhausted: no older history left or the budget was hit — stop re-firing.
        if (!hasMore || jumpRef.current.pages >= MAX_JUMP_PAGES) {
            jumpRef.current.done = true;
            onJumpConsumed?.();
        }
    }, [jumpTarget, messages, hasMore, isLoadingOlder, onLoadOlder, onJumpConsumed]);

    // Clear pending flash / divider-dismiss timers on unmount.
    useEffect(
        () => () => {
            clearTimeout(highlightTimer.current ?? undefined);
            clearTimeout(dividerClearTimer.current ?? undefined);
        },
        []
    );

    // The "New messages" divider clears only when the reader actively scrolls
    // DOWN into the bottom (a not-near-bottom → near-bottom transition). Focus,
    // channel-open auto-scroll, and live-follow all land at the bottom too but
    // must NOT dismiss an unseen divider — track the previous state for the edge.
    const wasNearBottomRef = useRef(true);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        setAtBottom(nearBottom);
        // Clear the divider only on a genuine scroll DOWN into the bottom (was
        // above it, now near it). Opening a channel or an auto-follow also reaches
        // the bottom, but those keep the divider until the reader scrolls past it.
        if (nearBottom && !wasNearBottomRef.current && isWindowActive()) {
            scheduleDividerClear();
        } else if (!nearBottom) {
            // Scrolled back up before the linger elapsed — keep the divider.
            cancelDividerClear();
        }
        wasNearBottomRef.current = nearBottom;
        if (el.scrollTop < LOAD_OLDER_PX && hasMore && !isLoadingOlder && onLoadOlder) {
            prependRef.current = { pending: true, prevHeight: el.scrollHeight, prevTop: el.scrollTop };
            onLoadOlder();
        }
    };

    const scrollToBottom = () => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });

    if (isLoading) {
        return (
            <div
                role="status"
                aria-live="polite"
                aria-label={t('chat.loading')}
                className="flex flex-1 flex-col gap-5 overflow-hidden p-4"
            >
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <Skeleton className="h-9 w-9 shrink-0" />
                        <div className="flex flex-1 flex-col gap-2 pt-1">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-muted-foreground">
                    <MessageSquare size={22} />
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-heading text-foreground">{t('chat.threadEmpty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('chat.threadEmptyHint')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex flex-1 flex-col overflow-hidden">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto p-4"
            >
                {isLoadingOlder && (
                    <div className="flex justify-center py-2" role="status" aria-label={t('chat.loading')}>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                    </div>
                )}
                {rows.map(row => {
                    if (row.kind === 'date') return <DateSeparator key={row.key} timestamp={row.timestamp} />;
                    if (row.kind === 'unread') {
                        return (
                            <div
                                key={row.key}
                                ref={unreadRef}
                                className={cn(
                                    'my-1 flex items-center gap-2 px-2 transition-opacity duration-300 ease-tactile motion-reduce:transition-none',
                                    dividerFading && 'opacity-0'
                                )}
                            >
                                <span className="h-px flex-1 bg-badge-unread/40" />
                                <span className="shrink-0 rounded-full bg-badge-unread px-2 py-0.5 text-overline text-badge-unread-foreground">
                                    {t('chat.newMessages')}
                                </span>
                                <span className="h-px flex-1 bg-badge-unread/40" />
                            </div>
                        );
                    }
                    if (row.kind === 'replies') {
                        // Slack-style thread divider: the reply count anchored left,
                        // a hairline filling the rest of the row.
                        return (
                            <div key={row.key} className="my-2 flex items-center gap-3 px-1">
                                <span className="shrink-0 text-caption font-semibold tabular-nums text-muted-foreground">
                                    {t('chat.thread.replyCount', { count: row.count })}
                                </span>
                                <span className="h-px flex-1 bg-hairline" />
                            </div>
                        );
                    }
                    return (
                        <MessageRow
                            key={row.group.key}
                            group={row.group}
                            onRetry={onRetry}
                            onDiscard={onDiscard}
                            threadMeta={threadMetaView}
                            onOpenThread={onOpenThread}
                            selfNames={selfNames}
                            highlightChatNo={highlightChatNo ?? undefined}
                            withDayInTime={threadReplyCount !== undefined}
                        />
                    );
                })}
                <div ref={bottomRef} />
            </div>
            {!atBottom &&
                (newCount > 0 ? (
                    // New messages arrived while scrolled up: a filled, centered
                    // "N new messages" badge (Slack-style) that jumps to the latest.
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        aria-label={t('chat.jumpToLatest')}
                        className="focus-ring tactile absolute bottom-4 left-1/2 z-20 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary pl-3 pr-2.5 text-caption font-semibold text-primary-foreground shadow-overlay transition-transform ease-tactile hover:bg-primary/90"
                    >
                        <span className="tabular-nums">
                            {t('chat.newMessageBadge', { count: newCount > 99 ? 99 : newCount })}
                        </span>
                        <ChevronDown size={16} />
                    </button>
                ) : (
                    // Scrolled up with nothing new: a plain jump-to-latest control.
                    <button
                        type="button"
                        onClick={scrollToBottom}
                        aria-label={t('chat.jumpToLatest')}
                        title={t('chat.jumpToLatest')}
                        className="focus-ring tactile border-hairline absolute bottom-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border bg-elevated text-foreground shadow-overlay transition-transform ease-tactile hover:bg-accent"
                    >
                        <ChevronDown size={18} />
                    </button>
                ))}
        </div>
    );
};
