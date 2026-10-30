import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, MessageSquare } from 'lucide-react';

import { isMentioningViewer } from '@chatic/data';
import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    Skeleton,
    resolveDisplay,
    useReducedMotion,
    useRovingFocus,
    useSiteProfileMap,
    viewerPlaceProfile,
} from '../../../shared';
import {
    buildMessageRows,
    firstVisibleChatNo,
    isOwnMessage,
    isViewerId,
    type MessageViewer,
    type ReactionTally,
    type ThreadMeta,
} from '../utils';
import { DateSeparator } from './DateSeparator';
import type { Mentionable } from './MentionAutocomplete';
import { SystemNotice } from './SystemNotice';
import {
    FEED_DEFAULT_ESTIMATE_PX,
    FEED_GAP_PX,
    JUMP_WINDOW_RETRY_MS,
    MAX_JUMP_WINDOW_RETRIES,
    feedRowKeyOf,
    indexOfChatNo,
    windowForViewport,
} from './feedWindow';
import { MessageRow, type ThreadMetaView } from './MessageRow';
import type { MentionResolver } from './RichText';

interface MessageListProps {
    messages: DomainChat[];
    /** Folded reactions keyed by the message they belong to. Both callers fold their own. */
    reactions?: ReadonlyMap<string, ReactionTally[]>;
    isLoading: boolean;
    viewer: MessageViewer;
    /** channel member id → display name, used to name authors when owner$ is absent. */
    names?: ReadonlyMap<string, string>;
    /** Roster the inline message editor offers for @-autocomplete and shows existing mentions from. */
    mentionables?: Mentionable[];
    /** Member roster still loading — render a name skeleton instead of "Unknown". */
    membersLoading?: boolean;
    /** Read position when the channel was opened — drives the "new messages" divider. */
    baselineReadNo?: number;
    /** Thread panel only: total replies under the root — renders an "N replies" divider. */
    threadReplyCount?: number;
    /**
     * Thread panel only: the "load earlier replies" row for a thread whose older replies are not all
     * loaded. It sits right under the root — inside the "N replies" divider when replies are showing,
     * on its own when none are.
     */
    olderReplies?: ReactNode;
    /** Thread panel only: older replies are still out, so the divider counts what is loaded, not the thread. */
    repliesPartial?: boolean;
    onRetry?: (message: DomainChat) => void;
    /** Whether a failed message offers Retry (a picture message only while its pictures are in memory). */
    canRetry?: (message: DomainChat) => boolean;
    /** Remove an unsent (failed / stuck-pending) message from the local cache. */
    onDiscard?: (message: DomainChat) => void;
    /** Fetch older history when the reader scrolls near the top. */
    onLoadOlder?: () => void;
    hasMore?: boolean;
    isLoadingOlder?: boolean;
    /** Increment to force a jump to the latest message (e.g. after you send). */
    scrollSignal?: number;
    /** Open pinned to the latest message, skipping the unread-divider landing (notification click). */
    openAtBottom?: boolean;
    /** root id → loaded reply aggregate; root rows render a thread footer. */
    threadMeta?: ReadonlyMap<string, ThreadMeta>;
    /** Open a thread; wired only for the main channel feed (not the thread panel). */
    onOpenThread?: (rootId: string) => void;
    /**
     * Scroll a specific message into view + flash it (saved-item / search jump).
     * `restore` puts it back at the top of the view without the flash (a return trip).
     */
    jumpTarget?: { chatNo: number | null; nonce: number; restore?: boolean };
    /** Called once a jump is consumed (landed or abandoned) so the store can clear. */
    onJumpConsumed?: () => void;
    /** The first message in view as the reader scrolls; null at the latest. */
    onReadingPosition?: (chatNo: number | null) => void;
    /**
     * What sits above the first message once the whole history is loaded (and in place of
     * the empty state): the channel's "this is the start of …" block. Absent in threads.
     */
    intro?: ReactNode;
    /** The room's first page failed to load: an empty list is not an empty room, so say so. */
    loadFailed?: boolean;
    /** Try the first page again, offered beside `loadFailed`. */
    onRetryLoad?: () => void;
    /**
     * The last older-history page failed. The next scroll retries it, but a
     * failure nothing shows reads as a room that simply ends — the pane shows a
     * retry row at the top instead. Retry reuses `onLoadOlder`.
     */
    loadOlderFailed?: boolean;
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
/** How long a jumped-to message stays flashed: the same 3s the inbox keeps an opened item marked. */
const JUMP_HIGHLIGHT_MS = 3000;

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/** Past this the exact count is not asserted — the badge says "N+" instead. */
const NEW_BADGE_CAP = 99;
// One array for every message that calls nobody "me", so a memo'd row sees the same prop.
const NO_SELF_NAMES: string[] = [];

export const MessageList = ({
    messages,
    reactions,
    isLoading,
    viewer,
    names,
    mentionables,
    membersLoading,
    baselineReadNo,
    threadReplyCount,
    olderReplies,
    repliesPartial,
    onRetry,
    canRetry,
    onDiscard,
    onLoadOlder,
    hasMore,
    isLoadingOlder,
    scrollSignal,
    openAtBottom,
    threadMeta,
    onOpenThread,
    jumpTarget,
    onJumpConsumed,
    onReadingPosition,
    intro,
    loadFailed,
    onRetryLoad,
    loadOlderFailed,
}: MessageListProps) => {
    const { t } = useTranslation();
    const reducedMotion = useReducedMotion();
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const roving = useRovingFocus(scrollRef);
    // Latched at mount (MessageList remounts per channel via its key), so a later
    // store clear can't flip it before the first fill lands.
    const openAtBottomRef = useRef(openAtBottom);
    const pinRafRef = useRef(0);

    // Pin the viewport to the bottom every frame for a short window. A single scroll
    // lands short: the list keeps reflowing (avatars, wrapping, optimistic→server
    // swap, older-page auto-fill), each nudging the viewport off the bottom. Pinning
    // the whole window rides through all of them — reliable where scrollIntoView isn't.
    // Every write is an instant jump, not an animation, so reduced motion needs no
    // branch here: skipping the loop would only bring back the short landing.
    const pinToBottom = () => {
        cancelAnimationFrame(pinRafRef.current);
        const deadline = performance.now() + 600;
        const snap = () => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
            if (performance.now() < deadline) pinRafRef.current = requestAnimationFrame(snap);
        };
        pinRafRef.current = requestAnimationFrame(snap);
    };
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
    const jumpRef = useRef<{ nonce: number; pages: number; done: boolean; windowRetries: number } | null>(null);
    const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const jumpWindowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Bumped by the window-retry timer so the jump effect re-runs once the
    // estimated scroll has mounted its target. Read only through the dep array.
    const [jumpTick, setJumpTick] = useState(0);

    const placeProfiles = useSiteProfileMap();
    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount),
        [messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount]
    );

    // --- Feed windowing: mount the viewport window, hold the rest as spacers. ---
    // A 500-message channel used to mount 500 RichText/BlockKit subtrees, and every
    // tail tick reconciled all of them. Rows outside the window unmount; spacers
    // keep the scrollbar honest. Sticky date pills are flat siblings now, so they
    // hand over by standard sticky stacking (see DateSeparator).
    const rowKeys = useMemo(() => rows.map(feedRowKeyOf), [rows]);
    // Measured heights by row key; the running average estimates the rest. Read
    // through a bump counter: refs don't trigger memos, the tick does.
    const measuredRef = useRef(new Map<string, number>());
    const [measuredTick, setMeasuredTick] = useState(0);
    const heights = useMemo(() => {
        void measuredTick;
        const measured = measuredRef.current;
        let sum = 0;
        measured.forEach(h => (sum += h));
        const avg = measured.size > 0 ? Math.max(24, sum / measured.size) : FEED_DEFAULT_ESTIMATE_PX;
        return rowKeys.map(key => measured.get(key) ?? avg);
    }, [rowKeys, measuredTick]);
    // Prefix offsets with one inter-row gap folded per row; spacer math reads off these.
    const offsets = useMemo(() => {
        const out = new Array<number>(heights.length + 1);
        out[0] = 0;
        for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i] + FEED_GAP_PX;
        return out;
    }, [heights]);
    // Live viewport. `known` flips on the first real layout; tests (no layout) stay
    // on the anchor window.
    const [viewport, setViewport] = useState({ top: 0, height: 0, known: false });
    const syncViewport = useCallback(() => {
        const el = scrollRef.current;
        if (!el || el.clientHeight <= 0) return;
        const top = el.scrollTop;
        const height = el.clientHeight;
        setViewport(prev =>
            prev.known && prev.top === top && prev.height === height ? prev : { top, height, known: true }
        );
    }, []);
    const win = useMemo(() => {
        // No layout yet (first paint, tests, hidden tab): mount whole, exactly like
        // before windowing — landing refs and every existing test see every row.
        // The mount effect below engages the window on the first measured frame.
        if (!viewport.known) return { start: 0, end: rows.length };
        return windowForViewport({
            count: rows.length,
            heightOf: i => heights[i] ?? FEED_DEFAULT_ESTIMATE_PX,
            scrollTop: viewport.top,
            viewportHeight: viewport.height,
        });
    }, [rows, heights, viewport]);
    // Off by one flex gap per spacer at most — absorbed by the overscan either way.
    const topSpacer = win.start > 0 ? Math.max(0, offsets[win.start]) : 0;
    const bottomSpacer = win.end < rows.length ? Math.max(0, offsets[rows.length] - offsets[win.end]) : 0;

    // Mounted rows report their heights. No manual scrollTop correction here: Chromium's
    // scroll anchoring already pins the reader's position when a row or the top spacer
    // above the viewport changes size, and adding the delta on top would move it twice.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(entries => {
            let dirty = false;
            for (const entry of entries) {
                const key = (entry.target as HTMLElement).dataset.rowKey;
                if (!key) continue;
                const size = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                const h = Math.max(8, Math.round(size));
                const prev = measuredRef.current.get(key);
                if (prev !== undefined && Math.abs(prev - h) < 1) continue;
                measuredRef.current.set(key, h);
                dirty = true;
            }
            if (dirty) setMeasuredTick(t => t + 1);
        });
        el.querySelectorAll('[data-row-key]').forEach(node => ro.observe(node));
        return () => ro.disconnect();
    }, [win, rows]);

    // Name a reactor the same way an author is named: the place nickname over the account name,
    // my own id resolving to me and others through the roster. Memoised because MessageRow is
    // memo'd — a fresh closure here would re-render every row on each list render.
    const reactorName = useMemo(() => {
        const resolve = (userId: string): string => {
            const mine = isViewerId(userId, viewer);
            const place = mine ? viewerPlaceProfile(viewer, placeProfiles) : placeProfiles[userId];
            return resolveDisplay(place, mine ? viewer.name : (names?.get(userId) ?? ''), undefined).name;
        };
        return resolve;
    }, [names, placeProfiles, viewer]);

    // Resolve thread repliers for the footer avatar stack the same way message
    // authors resolve: Place Profile override → roster name → viewer (own replies,
    // whose ownerId may be either the account or cloud id — see isOwnMessage).
    const threadMetaView = useMemo(() => {
        if (!threadMeta) return undefined;
        const view = new Map<string, ThreadMetaView>();
        for (const [rootKey, meta] of threadMeta) {
            const repliers = meta.repliers.slice(0, MAX_FOOTER_REPLIERS).map(replier => {
                const isMine = isViewerId(replier.id, viewer);
                const place = isMine ? viewerPlaceProfile(viewer, placeProfiles) : placeProfiles[replier.id];
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

    // @name → member, for mentions that open a profile. Stable identity: rows are memo'd.
    // Autocomplete inserts the resolved display name (place nick over global name), so
    // that is keyed first; the global name still resolves mentions typed by hand.
    const resolveMention = useMemo<MentionResolver>(() => {
        const byName = new Map<string, { userId: string; name: string }>();
        const people = [...(names ?? [])].map(([userId, name]) => ({
            userId,
            global: name,
            name: resolveDisplay(placeProfiles[userId], name, undefined).name,
        }));
        for (const key of ['name', 'global'] as const) {
            for (const person of people) {
                const k = person[key].trim().toLowerCase();
                if (k && !byName.has(k)) byName.set(k, { userId: person.userId, name: person.name });
            }
        }
        return name => byName.get(name.toLowerCase());
    }, [names, placeProfiles]);

    // Lowercased "me" names for self-mention highlighting: profile name, place nick under
    // either of my ids, and the name the roster has for either id — the one a sender's @ list
    // showed me under, which a mention chip carries. The roster name is wider than what the
    // notifiers read from text (`resolveMyMentionNames`): a highlight costs nothing when wrong.
    const selfNames = useMemo(() => {
        const mine = [
            viewer.name,
            ...[viewer.cloudUid, viewer.uid].flatMap(id => (id ? [placeProfiles[id]?.nick, names?.get(id)] : [])),
        ];
        return mine.filter((n): n is string => !!n?.trim()).map(n => n.trim().toLowerCase());
    }, [viewer, placeProfiles, names]);

    // Which names count as "me" in one message. A message with a mention record that does not
    // name me highlights nothing as mine: the `@Me` in it is someone else of the same name, and a
    // typed `@channel` did not call anyone — the record-first order of `mentionsMe`. Stable
    // identity: rows are memo'd.
    const selfNamesOf = useCallback(
        (message: DomainChat): string[] =>
            message.mention$ && !isMentioningViewer(message, [viewer.uid, viewer.cloudUid]) ? NO_SELF_NAMES : selfNames,
        [selfNames, viewer.uid, viewer.cloudUid]
    );

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
    // Stable refs so the focus/visibility listener can subscribe once (not per
    // render) yet still see the live at-bottom state + latest schedule closure.
    const atBottomRef = useRef(atBottom);
    atBottomRef.current = atBottom;
    const seenUpToRef = useRef(seenUpTo);
    seenUpToRef.current = seenUpTo;
    const scheduleDividerClearRef = useRef(scheduleDividerClear);
    scheduleDividerClearRef.current = scheduleDividerClear;

    // A message that arrives while the window is hidden raises the divider, and
    // useReadReceipts (also focus-gated) holds the read cursor back, so the badge
    // stays too. On refocus the badge clears (useReadReceipts flushes the read) —
    // match it: if the reader is already at the bottom (those messages are on
    // screen), clear the divider on the same edge so the two never disagree. A
    // scrolled-up reader keeps the divider as their jump anchor.
    useEffect(() => {
        const onActivity = () => {
            // Only when a divider is actually showing (unseen tail) — otherwise a
            // routine focus would arm a pointless timer + fade toggle.
            const hasDivider = seenUpToRef.current < maxChatNoRef.current;
            if (isWindowActive() && atBottomRef.current && hasDivider) scheduleDividerClearRef.current();
        };
        document.addEventListener('visibilitychange', onActivity);
        window.addEventListener('focus', onActivity);
        return () => {
            document.removeEventListener('visibilitychange', onActivity);
            window.removeEventListener('focus', onActivity);
        };
    }, []);

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
        // otherwise the bottom. A notification-click open (openAtBottom) skips the
        // divider and pins to the latest — the message the user was pinged about —
        // riding the post-mount reflow so it lands ON the bottom, not a row short.
        if (firstFill && !didInitRef.current) {
            didInitRef.current = true;
            if (openAtBottomRef.current) {
                setAtBottom(true);
                pinToBottom();
            } else if (unreadRef.current) {
                unreadRef.current.scrollIntoView({ block: 'center' });
            } else {
                bottomRef.current?.scrollIntoView({ block: 'end' });
            }
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
        syncViewport();
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
        pinToBottom();
        return () => cancelAnimationFrame(pinRafRef.current);
    }, [scrollSignal]);

    // The "New messages" divider clears only when the reader actively scrolls
    // DOWN into the bottom (a not-near-bottom → near-bottom transition). Focus,
    // channel-open auto-scroll, and live-follow all land at the bottom too but
    // must NOT dismiss an unseen divider — track the previous state for the edge.
    const wasNearBottomRef = useRef(true);

    // Drive a jump request: center the target message's DOM node and flash it.
    // If it isn't loaded (older than the live page), page older — bounded — and
    // the `messages` dependency re-runs this as each page lands.
    useEffect(() => {
        if (!jumpTarget) return;
        const el = scrollRef.current;
        if (!el) return;
        // New request → reset the paging budget + done latch.
        if (jumpRef.current?.nonce !== jumpTarget.nonce) {
            jumpRef.current = { nonce: jumpTarget.nonce, pages: 0, done: false, windowRetries: 0 };
        }
        // Already handled (landed or abandoned) — don't re-scroll on live-tail ticks
        // that re-run this effect before the store clears the target.
        if (jumpRef.current.done) return;
        // A return point is the reading position, not a message to find. Back to the
        // latest, or to an anchor that is gone, both end at the bottom, where the feed
        // opens; paging back for it and reporting "not found" would strand the reader.
        const restoreToBottom = () => {
            jumpRef.current = { nonce: jumpTarget.nonce, pages: 0, done: true, windowRetries: 0 };
            setAtBottom(true);
            wasNearBottomRef.current = true;
            pinToBottom();
            onJumpConsumed?.();
        };
        if (jumpTarget.chatNo == null) {
            restoreToBottom();
            return;
        }
        const node = el.querySelector<HTMLElement>(`[data-chat-no="${jumpTarget.chatNo}"]`);
        if (node) {
            jumpRef.current.windowRetries = 0;
            if (jumpWindowTimer.current) clearTimeout(jumpWindowTimer.current);
            node.scrollIntoView({ block: jumpTarget.restore ? 'start' : 'center' });
            if (!jumpTarget.restore) {
                setHighlightChatNo(jumpTarget.chatNo);
                if (highlightTimer.current) clearTimeout(highlightTimer.current);
                highlightTimer.current = setTimeout(() => setHighlightChatNo(null), JUMP_HIGHLIGHT_MS);
            }
            // Settle the pin state now. It used to wait for the scroll frame, so a page
            // landing in between still saw "at the bottom", followed the tail, and carried
            // the reader past the message they jumped to.
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
            setAtBottom(nearBottom);
            wasNearBottomRef.current = nearBottom;
            jumpRef.current.done = true;
            onJumpConsumed?.();
            return;
        }
        // Loaded but outside the mounted window → estimate-scroll it into the window
        // and retry (bounded): the next frames mount it and the branch above lands.
        // Without layout (tests) everything is mounted, so this never fires there.
        if (jumpTarget.chatNo != null) {
            const targetIndex = indexOfChatNo(rows, jumpTarget.chatNo);
            if (targetIndex >= 0 && jumpRef.current.windowRetries < MAX_JUMP_WINDOW_RETRIES) {
                jumpRef.current.windowRetries += 1;
                el.scrollTop = Math.max(0, (offsets[targetIndex] ?? 0) - el.clientHeight / 2);
                syncViewport();
                if (jumpWindowTimer.current) clearTimeout(jumpWindowTimer.current);
                jumpWindowTimer.current = setTimeout(() => setJumpTick(t => t + 1), JUMP_WINDOW_RETRY_MS);
                return;
            }
        }
        // Not loaded yet → page older until found or the budget/history runs out.
        if (hasMore && !isLoadingOlder && jumpRef.current.pages < MAX_JUMP_PAGES) {
            jumpRef.current.pages += 1;
            onLoadOlder?.();
            return;
        }
        // Exhausted: no older history left or the budget was hit — stop re-firing.
        // Say so. Giving up silently left the reader mid-history, paged back up to
        // eight pages, with no highlight and no hint that the target was not found.
        if (!hasMore || jumpRef.current.pages >= MAX_JUMP_PAGES) {
            if (jumpTarget.restore) {
                restoreToBottom();
                return;
            }
            jumpRef.current.done = true;
            toast({ variant: 'info', description: t('chat.jump.notFound') });
            onJumpConsumed?.();
        }
    }, [
        jumpTarget,
        jumpTick,
        messages,
        rows,
        offsets,
        hasMore,
        isLoadingOlder,
        onLoadOlder,
        onJumpConsumed,
        t,
        syncViewport,
    ]);

    // Auto-fill the viewport: when the loaded page can't be scrolled (scrollHeight
    // fits the viewport) there's no scroll-up to trigger loadOlder, so older history
    // stays unreachable. Common in thread-heavy channels — most of a 50-item page is
    // replies, which the main feed hides, leaving only a handful of top-level rows.
    // Pull older pages until the feed overflows (giving a manual scroll handle) or
    // history runs out (hasMore guards termination; isLoadingOlder serialises).
    // A feed with nothing to show fits too, though it renders no scroller: a newest page whose messages
    // were all deleted, or that held only replies to deleted roots, leaves the room blank with history
    // below it.
    // A failed page stops the pull until its retry, instead of asking again on every settle. A feed
    // still loading its first page is empty for that reason only: no pull then.
    useEffect(() => {
        if (isLoading || !hasMore || isLoadingOlder || loadOlderFailed || !onLoadOlder) return;
        const el = scrollRef.current;
        if (el ? el.scrollHeight <= el.clientHeight + LOAD_OLDER_PX : messages.length === 0) onLoadOlder();
    }, [rows, messages.length, isLoading, hasMore, isLoadingOlder, loadOlderFailed, onLoadOlder]);

    // Read the live viewport once mounted (the anchor window covers first paint).
    useEffect(() => {
        syncViewport();
    }, [syncViewport]);

    // Clear pending flash / divider-dismiss timers on unmount.
    useEffect(
        () => () => {
            clearTimeout(highlightTimer.current ?? undefined);
            clearTimeout(jumpWindowTimer.current ?? undefined);
            clearTimeout(dividerClearTimer.current ?? undefined);
            cancelAnimationFrame(pinRafRef.current);
        },
        []
    );

    // Scroll events fire many times per frame; the handler reads three layout
    // properties each time. Coalesce to one pass per animation frame.
    const scrollRafRef = useRef(0);
    useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);
    const onScroll = () => {
        if (scrollRafRef.current) return;
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = 0;
            handleScroll();
        });
    };
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        syncViewport();
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        setAtBottom(nearBottom);
        if (onReadingPosition) onReadingPosition(nearBottom ? null : firstVisibleChatNo(el));
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

    // `behavior` is a JS argument, so the stylesheet's reduced-motion block cannot
    // reach it — this is the one scroll the global override does not cover.
    const scrollToBottom = () =>
        bottomRef.current?.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'auto' : 'smooth' });

    // Nothing shown yet, but older history to pull: still loading, not an empty room.
    const pagingIntoEmpty = messages.length === 0 && !!hasMore && !!onLoadOlder;
    if (isLoading || (pagingIntoEmpty && !loadOlderFailed)) {
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

    if (messages.length === 0 && (loadFailed || (pagingIntoEmpty && loadOlderFailed))) {
        // The first page, or the older page an empty feed was pulling: retry whichever failed.
        const retry = loadFailed ? onRetryLoad : onLoadOlder;
        return (
            <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-callout text-foreground">{t('chat.loadFailed')}</p>
                {retry && (
                    <button
                        type="button"
                        onClick={retry}
                        className="focus-ring tactile rounded-lg bg-muted px-3 py-2 text-callout font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        {t('chat.retry')}
                    </button>
                )}
            </div>
        );
    }

    if (messages.length === 0) {
        if (intro) {
            return <div className="flex flex-1 flex-col justify-end overflow-y-auto px-6 py-5">{intro}</div>;
        }
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
                onFocus={roving.onFocus}
                onKeyDown={roving.onKeyDown}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={isLoadingOlder || undefined}
                aria-label={t('chat.feedLabel')}
                className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-5"
            >
                {isLoadingOlder && (
                    <div className="flex justify-center py-2" role="status" aria-label={t('chat.loading')}>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                    </div>
                )}
                {/* A failed older page stays retried by scrolls, but nothing may show it:
                    without this row the history reads as simply ended. */}
                {loadOlderFailed && !isLoadingOlder && onLoadOlder && (
                    <div className="flex items-center justify-center gap-2 py-2">
                        <p role="status" className="text-caption text-muted-foreground">
                            {t('chat.loadOlderFailed')}
                        </p>
                        <button
                            type="button"
                            onClick={onLoadOlder}
                            className="focus-ring tactile rounded-lg bg-muted px-3 py-1.5 text-caption font-medium text-foreground transition-colors hover:bg-accent"
                        >
                            {t('chat.retry')}
                        </button>
                    </div>
                )}
                {!hasMore && !isLoadingOlder && intro}
                {/* Windowed rows: only the viewport window mounts, spacers hold the rest.
                    Sticky date pills are flat siblings and hand over by stacking. */}
                {/* shrink-0: the feed is a flex column, and an empty div there shrinks to 0 px once the
                    content overflows — the spacer would hold no height at all. */}
                {topSpacer > 0 && (
                    <div aria-hidden data-feed-spacer="top" className="shrink-0" style={{ height: topSpacer }} />
                )}
                {rows.slice(win.start, win.end).map(row => {
                    if (row.kind === 'date') {
                        return <DateSeparator key={row.key} rowKey={row.key} timestamp={row.timestamp} />;
                    }
                    if (row.kind === 'system') {
                        return (
                            <SystemNotice
                                key={row.key}
                                rowKey={row.key}
                                chat={row.chat}
                                authorName={row.authorName}
                                joinedNames={row.joinedNames}
                            />
                        );
                    }
                    if (row.kind === 'unread') {
                        return (
                            <div
                                key={row.key}
                                data-row-key={row.key}
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
                            <div key={row.key} data-row-key={row.key} className="my-2 flex flex-col gap-2">
                                <div className="flex items-center gap-3 px-1">
                                    <span className="shrink-0 text-caption font-semibold tabular-nums text-muted-foreground">
                                        {t(repliesPartial ? 'chat.thread.replyCountLoaded' : 'chat.thread.replyCount', {
                                            count: row.count,
                                        })}
                                    </span>
                                    <span className="h-px flex-1 bg-hairline" />
                                </div>
                                {olderReplies}
                            </div>
                        );
                    }
                    // Only the block holding the target gets it: handed to every row, a
                    // jump re-rendered the whole feed twice (on the flash and on its clear).
                    const highlight =
                        highlightChatNo != null && row.group.messages.some(m => m.chatNo === highlightChatNo)
                            ? highlightChatNo
                            : undefined;
                    return (
                        <MessageRow
                            key={row.group.key}
                            group={row.group}
                            onRetry={onRetry}
                            canRetry={canRetry}
                            onDiscard={onDiscard}
                            threadMeta={threadMetaView}
                            onOpenThread={onOpenThread}
                            selfNamesOf={selfNamesOf}
                            resolveMention={resolveMention}
                            mentionables={mentionables}
                            highlightChatNo={highlight}
                            withDayInTime={threadReplyCount !== undefined}
                            reactions={reactions}
                            reactorName={reactorName}
                            toolbarUnderHeader={threadReplyCount !== undefined}
                        />
                    );
                })}
                {bottomSpacer > 0 && (
                    <div aria-hidden data-feed-spacer="bottom" className="shrink-0" style={{ height: bottomSpacer }} />
                )}
                {/* No reply is showing yet, so there is no divider to hold the row: it stands under the root. */}
                {olderReplies && !rows.some(row => row.kind === 'replies') && olderReplies}
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
                        className="focus-ring tactile absolute bottom-4 left-1/2 z-float flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary pl-3 pr-2.5 text-caption font-semibold text-primary-foreground shadow-overlay transition-transform ease-tactile hover:bg-primary/90"
                    >
                        <span className="tabular-nums">
                            {newCount > NEW_BADGE_CAP
                                ? t('chat.newMessageBadgeOverflow', { cap: NEW_BADGE_CAP })
                                : t('chat.newMessageBadge', { count: newCount })}
                        </span>
                        <ChevronDown size={16} />
                    </button>
                ) : (
                    // Scrolled up with nothing new: a plain jump-to-latest control.
                    <Hint label={t('chat.jumpToLatest')}>
                        <button
                            type="button"
                            onClick={scrollToBottom}
                            aria-label={t('chat.jumpToLatest')}
                            className="focus-ring tactile border-hairline absolute bottom-4 right-4 z-float flex h-9 w-9 items-center justify-center rounded-full border bg-elevated text-foreground shadow-overlay transition-transform ease-tactile hover:bg-accent"
                        >
                            <ChevronDown size={18} />
                        </button>
                    </Hint>
                ))}
        </div>
    );
};
