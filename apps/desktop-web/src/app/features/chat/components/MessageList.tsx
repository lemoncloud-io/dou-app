import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, MessageSquare } from 'lucide-react';

import { isMentioningViewer } from '@chatic/runtime';
import type { DomainChat } from '@chatic/runtime';
import { cn } from '@chatic/ui-kit';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    Skeleton,
    resolveDisplay,
    useReducedMotion,
    useRovingFocus,
    useSiteProfileMap,
    viewerPlaceProfile,
    type MemberReadCursor,
    type ReadCount,
} from '../../../shared';
import {
    buildMessageRows,
    firstVisibleChatNo,
    isOwnMessage,
    isViewerId,
    placeReadMarkers,
    selectedTranscript,
    type MessageViewer,
    type ReactionTally,
    type ThreadMeta,
} from '../utils';
import { useStartOfToday } from '../hooks/useStartOfToday';
import { DateSeparator } from './DateSeparator';
import type { Mentionable } from './MentionAutocomplete';
import { SystemNotice } from './SystemNotice';
import {
    FEED_DEFAULT_ESTIMATE_PX,
    FEED_GAP_PX,
    JUMP_WINDOW_RETRY_MS,
    MAX_JUMP_WINDOW_RETRIES,
    feedRowKeyOf,
    groupIntoDayBlocks,
    indexOfChatNo,
    windowForViewport,
} from './feedWindow';
import { MessageRow, type ThreadMetaView } from './MessageRow';
import type { ReadMarker, ReadPerson } from './ReadReceiptPill';
import type { MentionResolver } from './RichText';

interface MessageListProps {
    messages: DomainChat[];
    reactions?: ReadonlyMap<string, ReactionTally[]>;
    isLoading: boolean;
    viewer: MessageViewer;
    names?: ReadonlyMap<string, string>;
    mentionables?: Mentionable[];
    membersLoading?: boolean;
    baselineReadNo?: number;
    threadReplyCount?: number;
    olderReplies?: ReactNode;
    repliesPartial?: boolean;
    onRetry?: (message: DomainChat) => void;
    canRetry?: (message: DomainChat) => boolean;
    onDiscard?: (message: DomainChat) => void;
    onCancelUpload?: (message: DomainChat) => void;
    onLoadOlder?: () => void;
    hasMore?: boolean;
    isLoadingOlder?: boolean;
    scrollSignal?: number;
    openAtBottom?: boolean;
    threadMeta?: ReadonlyMap<string, ThreadMeta>;
    onOpenThread?: (rootId: string) => void;
    onShowMessage?: (message: DomainChat) => void;
    jumpTarget?: { chatNo: number | null; nonce: number; restore?: boolean };
    onJumpConsumed?: () => void;
    onReadingPosition?: (chatNo: number | null) => void;
    intro?: ReactNode;
    loadFailed?: boolean;
    onRetryLoad?: () => void;
    loadOlderFailed?: boolean;
    readCountOf?: (chatNo: number, authorId: string) => ReadCount | null;
    readCursors?: readonly MemberReadCursor[];
}

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 120;
const MAX_JUMP_PAGES = 8;
const MAX_FOOTER_REPLIERS = 3;
const DIVIDER_CLEAR_DELAY_MS = 1000;
const DIVIDER_FADE_MS = 300;
const JUMP_HIGHLIGHT_MS = 3000;

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

const NEW_BADGE_CAP = 99;
const isCountable = (message: DomainChat): message is DomainChat & { chatNo: number } =>
    !message.isPending &&
    !message.isFailed &&
    !message.hidden &&
    typeof message.chatNo === 'number' &&
    message.chatNo > 0 &&
    message.chatNo !== Number.MAX_SAFE_INTEGER;

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
    onCancelUpload,
    onLoadOlder,
    hasMore,
    isLoadingOlder,
    scrollSignal,
    openAtBottom,
    threadMeta,
    onOpenThread,
    onShowMessage,
    jumpTarget,
    onJumpConsumed,
    onReadingPosition,
    intro,
    loadFailed,
    onRetryLoad,
    loadOlderFailed,
    readCountOf,
    readCursors,
}: MessageListProps) => {
    const { t } = useTranslation();
    const reducedMotion = useReducedMotion();
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const roving = useRovingFocus(scrollRef);
    const openAtBottomRef = useRef(openAtBottom);
    const pinRafRef = useRef(0);

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
    const prependRef = useRef<{ pending: boolean; prevHeight: number; prevTop: number }>({
        pending: false,
        prevHeight: 0,
        prevTop: 0,
    });
    const prevLenRef = useRef(0);
    const seenMaxRef = useRef(0);
    const [newCount, setNewCount] = useState(0);
    const unreadRef = useRef<HTMLDivElement>(null);
    const didInitRef = useRef(false);
    const [seenUpTo, setSeenUpTo] = useState(baselineReadNo ?? 0);
    const [highlightChatNo, setHighlightChatNo] = useState<number | null>(null);
    const jumpRef = useRef<{ nonce: number; pages: number; done: boolean; windowRetries: number } | null>(null);
    const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const jumpWindowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [jumpTick, setJumpTick] = useState(0);

    const placeProfiles = useSiteProfileMap();
    const today = useStartOfToday();
    const rows = useMemo(
        () =>
            buildMessageRows(messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount, today),
        [messages, viewer, names, seenUpTo, membersLoading, placeProfiles, threadReplyCount, today]
    );

    const rowKeys = useMemo(() => rows.map(feedRowKeyOf), [rows]);
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
    const offsets = useMemo(() => {
        const out = new Array<number>(heights.length + 1);
        out[0] = 0;
        for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i] + FEED_GAP_PX;
        return out;
    }, [heights]);
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
        if (!viewport.known) return { start: 0, end: rows.length };
        return windowForViewport({
            count: rows.length,
            heightOf: i => heights[i] ?? FEED_DEFAULT_ESTIMATE_PX,
            scrollTop: viewport.top,
            viewportHeight: viewport.height,
        });
    }, [rows, heights, viewport]);
    const topSpacer = win.start > 0 ? Math.max(0, offsets[win.start]) : 0;
    const bottomSpacer = win.end < rows.length ? Math.max(0, offsets[rows.length] - offsets[win.end]) : 0;

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

    const reactorName = useMemo(() => {
        const resolve = (userId: string): string => {
            const mine = isViewerId(userId, viewer);
            const place = mine ? viewerPlaceProfile(viewer, placeProfiles) : placeProfiles[userId];
            return resolveDisplay(place, mine ? viewer.name : (names?.get(userId) ?? ''), undefined).name;
        };
        return resolve;
    }, [names, placeProfiles, viewer]);

    const readPerson = useMemo(() => {
        const roster = new Map((mentionables ?? []).filter(m => !m.everyone).map(m => [m.id, m] as const));
        return (userId: string): ReadPerson => {
            const mine = isViewerId(userId, viewer);
            const place = mine ? viewerPlaceProfile(viewer, placeProfiles) : placeProfiles[userId];
            const fallbackName = mine ? viewer.name : (names?.get(userId) ?? roster.get(userId)?.name ?? '');
            const display = resolveDisplay(place, fallbackName, roster.get(userId)?.thumbnail);
            return { id: userId, name: display.name || t('profile.unknown'), thumbnail: display.thumbnail };
        };
    }, [mentionables, names, placeProfiles, viewer, t]);

    const readPlacements = useMemo(
        () =>
            readCountOf && readCursors?.length
                ? placeReadMarkers(
                      readCursors,
                      messages.filter(isCountable).map(message => message.chatNo)
                  )
                : undefined,
        [readCountOf, readCursors, messages]
    );

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
            view.set(rootKey, { count: meta.count, lastReplyAt: meta.lastReplyAt, newCount: meta.newCount, repliers });
        }
        return view;
    }, [threadMeta, names, placeProfiles, viewer]);

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

    const selfNames = useMemo(() => {
        const mine = [
            viewer.name,
            ...[viewer.cloudUid, viewer.uid].flatMap(id => (id ? [placeProfiles[id]?.nick, names?.get(id)] : [])),
        ];
        return mine.filter((n): n is string => !!n?.trim()).map(n => n.trim().toLowerCase());
    }, [viewer, placeProfiles, names]);

    const selfNamesOf = useCallback(
        (message: DomainChat): string[] =>
            message.mention$ && !isMentioningViewer(message, [viewer.uid, viewer.cloudUid]) ? NO_SELF_NAMES : selfNames,
        [selfNames, viewer.uid, viewer.cloudUid]
    );

    const maxChatNo = useMemo(
        () =>
            messages.reduce(
                (m, c) =>
                    !c.isPending && c.chatNo && c.chatNo !== Number.MAX_SAFE_INTEGER && c.chatNo > m ? c.chatNo : m,
                0
            ),
        [messages]
    );
    const maxChatNoRef = useRef(maxChatNo);
    maxChatNoRef.current = maxChatNo;
    const dividerClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dividerFading, setDividerFading] = useState(false);
    const scheduleDividerClear = () => {
        if (dividerClearTimer.current) clearTimeout(dividerClearTimer.current);
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
        setDividerFading(false);
    };
    const atBottomRef = useRef(atBottom);
    atBottomRef.current = atBottom;
    const seenUpToRef = useRef(seenUpTo);
    seenUpToRef.current = seenUpTo;
    const scheduleDividerClearRef = useRef(scheduleDividerClear);
    scheduleDividerClearRef.current = scheduleDividerClear;

    useEffect(() => {
        const onActivity = () => {
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

    useEffect(() => {
        setSeenUpTo(prev => Math.max(prev, baselineReadNo ?? 0));
    }, [baselineReadNo]);

    const newReplyRoot = useMemo(() => {
        if (!threadMeta) return null;
        let oldest: number | null = null;
        for (const message of messages) {
            if (message.chatNo == null || !threadMeta.get(String(message.chatNo))?.newCount) continue;
            if (oldest === null || message.chatNo < oldest) oldest = message.chatNo;
        }
        return oldest;
    }, [messages, threadMeta]);
    const newReplyRootRef = useRef(newReplyRoot);
    newReplyRootRef.current = newReplyRoot;

    useLayoutEffect(() => {
        const el = scrollRef.current;
        const grew = messages.length > prevLenRef.current;
        const firstFill = prevLenRef.current === 0 && messages.length > 0;
        prevLenRef.current = messages.length;
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
        if (prependRef.current.pending) {
            el.scrollTop = el.scrollHeight - prependRef.current.prevHeight + prependRef.current.prevTop;
            prependRef.current.pending = false;
            return;
        }
        if (firstFill && !didInitRef.current) {
            didInitRef.current = true;
            const rootNo = newReplyRootRef.current;
            const replyRoot = rootNo === null ? null : el.querySelector<HTMLElement>(`[data-chat-no="${rootNo}"]`);
            if (openAtBottomRef.current) {
                setAtBottom(true);
                pinToBottom();
            } else if (unreadRef.current) {
                unreadRef.current.scrollIntoView({ block: 'center' });
            } else if (replyRoot) {
                replyRoot.scrollIntoView({ block: 'center' });
            } else {
                bottomRef.current?.scrollIntoView({ block: 'end' });
            }
            return;
        }
        if (grew && atBottom) {
            el.scrollTop = el.scrollHeight;
            if (isWindowActive()) setSeenUpTo(prev => Math.max(prev, maxChatNo));
        }
        syncViewport();
    }, [messages, atBottom, maxChatNo, viewer]);

    useEffect(() => {
        if (!scrollSignal) return;
        setAtBottom(true);
        scheduleDividerClear();
        pinToBottom();
        return () => cancelAnimationFrame(pinRafRef.current);
    }, [scrollSignal]);

    const wasNearBottomRef = useRef(true);

    useEffect(() => {
        if (!jumpTarget) return;
        const el = scrollRef.current;
        if (!el) return;
        if (jumpRef.current?.nonce !== jumpTarget.nonce) {
            jumpRef.current = { nonce: jumpTarget.nonce, pages: 0, done: false, windowRetries: 0 };
        }
        if (jumpRef.current.done) return;
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
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
            setAtBottom(nearBottom);
            wasNearBottomRef.current = nearBottom;
            jumpRef.current.done = true;
            onJumpConsumed?.();
            return;
        }
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
        if (hasMore && !isLoadingOlder && jumpRef.current.pages < MAX_JUMP_PAGES) {
            jumpRef.current.pages += 1;
            onLoadOlder?.();
            return;
        }
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

    useEffect(() => {
        if (isLoading || !hasMore || isLoadingOlder || loadOlderFailed || !onLoadOlder) return;
        const el = scrollRef.current;
        if (el ? el.scrollHeight <= el.clientHeight + LOAD_OLDER_PX : messages.length === 0) onLoadOlder();
    }, [rows, messages.length, isLoading, hasMore, isLoadingOlder, loadOlderFailed, onLoadOlder]);

    useEffect(() => {
        syncViewport();
    }, [syncViewport]);

    useEffect(
        () => () => {
            clearTimeout(highlightTimer.current ?? undefined);
            clearTimeout(jumpWindowTimer.current ?? undefined);
            clearTimeout(dividerClearTimer.current ?? undefined);
            cancelAnimationFrame(pinRafRef.current);
        },
        []
    );

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
        if (nearBottom && !wasNearBottomRef.current && isWindowActive()) {
            scheduleDividerClear();
        } else if (!nearBottom) {
            cancelDividerClear();
        }
        wasNearBottomRef.current = nearBottom;
        if (el.scrollTop < LOAD_OLDER_PX && hasMore && !isLoadingOlder && onLoadOlder) {
            prependRef.current = { pending: true, prevHeight: el.scrollHeight, prevTop: el.scrollTop };
            onLoadOlder();
        }
    };

    const scrollToBottom = () =>
        bottomRef.current?.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'auto' : 'smooth' });

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

    const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
        const transcript = selectedTranscript(
            event.currentTarget,
            window.getSelection(),
            rows,
            t('chat.deletedMessage')
        );
        if (transcript === null) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain', transcript);
    };

    return (
        <div className="relative flex flex-1 flex-col overflow-hidden">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                onCopy={onCopy}
                onFocus={roving.onFocus}
                onKeyDown={roving.onKeyDown}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={isLoadingOlder || undefined}
                aria-label={t('chat.feedLabel')}
                className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-5 [container-type:inline-size]"
            >
                {isLoadingOlder && (
                    <div className="flex justify-center py-2" role="status" aria-label={t('chat.loading')}>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
                    </div>
                )}
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
                {topSpacer > 0 && (
                    <div aria-hidden data-feed-spacer="top" className="shrink-0" style={{ height: topSpacer }} />
                )}
                {groupIntoDayBlocks(rows.slice(win.start, win.end)).map(block => (
                    <div key={block.key} className="flex flex-col gap-2">
                        {block.rows.map(row => {
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
                                return (
                                    <div key={row.key} data-row-key={row.key} className="my-2 flex flex-col gap-2">
                                        <div className="flex items-center gap-3 px-1">
                                            <span className="shrink-0 text-caption font-semibold tabular-nums text-muted-foreground">
                                                {t(
                                                    repliesPartial
                                                        ? 'chat.thread.replyCountLoaded'
                                                        : 'chat.thread.replyCount',
                                                    {
                                                        count: row.count,
                                                    }
                                                )}
                                            </span>
                                            <span className="h-px flex-1 bg-hairline" />
                                        </div>
                                        {olderReplies}
                                    </div>
                                );
                            }
                            const highlight =
                                highlightChatNo != null && row.group.messages.some(m => m.chatNo === highlightChatNo)
                                    ? highlightChatNo
                                    : undefined;
                            let readMarkers: Record<number, ReadMarker> | undefined;
                            if (readCountOf && !readCursors) {
                                const last = row.group.messages.filter(isCountable).at(-1);
                                const count = last ? readCountOf(last.chatNo, last.ownerId ?? '') : null;
                                if (last && count) {
                                    const readers = count.readIds.map(readPerson);
                                    readMarkers = {
                                        [last.chatNo]: {
                                            faces: readers,
                                            readers,
                                            nonReaders: count.unreadIds.map(readPerson),
                                            counted: true,
                                        },
                                    };
                                }
                            } else if (readPlacements && readCountOf) {
                                for (const settled of row.group.messages) {
                                    if (!isCountable(settled)) continue;
                                    const members = readPlacements
                                        .get(settled.chatNo)
                                        ?.filter(id => id !== settled.ownerId);
                                    const count = members?.length
                                        ? readCountOf(settled.chatNo, settled.ownerId ?? '')
                                        : null;
                                    if (!members?.length || !count) continue;
                                    readMarkers = {
                                        ...readMarkers,
                                        [settled.chatNo]: {
                                            faces: members.map(readPerson),
                                            readers: count.readIds.map(readPerson),
                                            nonReaders: count.unreadIds.map(readPerson),
                                        },
                                    };
                                }
                            }
                            return (
                                <MessageRow
                                    key={row.group.key}
                                    group={row.group}
                                    onRetry={onRetry}
                                    canRetry={canRetry}
                                    onDiscard={onDiscard}
                                    onCancelUpload={onCancelUpload}
                                    threadMeta={threadMetaView}
                                    onOpenThread={onOpenThread}
                                    onShowMessage={onShowMessage}
                                    selfNamesOf={selfNamesOf}
                                    resolveMention={resolveMention}
                                    mentionables={mentionables}
                                    highlightChatNo={highlight}
                                    withDayInTime={threadReplyCount !== undefined}
                                    reactions={reactions}
                                    reactorName={reactorName}
                                    readMarkers={readMarkers}
                                />
                            );
                        })}
                    </div>
                ))}
                {bottomSpacer > 0 && (
                    <div aria-hidden data-feed-spacer="bottom" className="shrink-0" style={{ height: bottomSpacer }} />
                )}
                {olderReplies && !rows.some(row => row.kind === 'replies') && olderReplies}
                <div ref={bottomRef} />
            </div>
            {!atBottom &&
                (newCount > 0 ? (
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
