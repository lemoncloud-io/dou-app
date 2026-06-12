import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, MessageSquare } from 'lucide-react';

import type { DomainChat } from '@chatic/data';

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
}

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 120;
/** Slack-style thread footer shows at most this many replier avatars. */
const MAX_FOOTER_REPLIERS = 3;

export const MessageList = ({
    messages,
    isLoading,
    viewer,
    names,
    membersLoading,
    baselineReadNo,
    onRetry,
    onDiscard,
    onLoadOlder,
    hasMore,
    isLoadingOlder,
    scrollSignal,
    threadMeta,
    onOpenThread,
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

    const placeProfiles = useSiteProfileMap();
    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, baselineReadNo, membersLoading, placeProfiles),
        [messages, viewer, names, baselineReadNo, membersLoading, placeProfiles]
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

    const maxChatNo = useMemo(() => messages.reduce((m, c) => Math.max(m, c.chatNo ?? 0), 0), [messages]);

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
        if (grew && atBottom) el.scrollTop = el.scrollHeight;
    }, [messages, atBottom, maxChatNo, viewer]);

    // After sending, snap to the latest even if the reader had scrolled up. A
    // single scroll lands short: the optimistic message renders, then the list
    // reflows over the next few frames (optimistic→server swap, height change),
    // each nudging the viewport off the bottom. Pin to the bottom every frame for
    // a short window so it rides through all of them.
    useEffect(() => {
        if (!scrollSignal) return;
        setAtBottom(true);
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

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
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
                            <div key={row.key} ref={unreadRef} className="my-1 flex items-center gap-2 px-2">
                                <span className="h-px flex-1 bg-badge-unread/40" />
                                <span className="shrink-0 rounded-full bg-badge-unread px-2 py-0.5 text-overline text-badge-unread-foreground">
                                    {t('chat.newMessages')}
                                </span>
                                <span className="h-px flex-1 bg-badge-unread/40" />
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
                        className="focus-ring tactile absolute bottom-4 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary pl-3 pr-2.5 text-caption font-semibold text-primary-foreground shadow-overlay transition-transform ease-tactile hover:bg-primary/90"
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
                        className="focus-ring tactile border-hairline absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border bg-elevated text-foreground shadow-overlay transition-transform ease-tactile hover:bg-accent"
                    >
                        <ChevronDown size={18} />
                    </button>
                ))}
        </div>
    );
};
