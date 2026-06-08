import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import type { DomainChat } from '@chatic/data';

import { Skeleton } from '../../../shared';
import { buildMessageRows, type MessageViewer } from '../utils';
import { DateSeparator } from './DateSeparator';
import { MessageRow } from './MessageRow';

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
    /** Fetch older history when the reader scrolls near the top. */
    onLoadOlder?: () => void;
    hasMore?: boolean;
    isLoadingOlder?: boolean;
    /** Increment to force a jump to the latest message (e.g. after you send). */
    scrollSignal?: number;
}

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 120;

export const MessageList = ({
    messages,
    isLoading,
    viewer,
    names,
    membersLoading,
    baselineReadNo,
    onRetry,
    onLoadOlder,
    hasMore,
    isLoadingOlder,
    scrollSignal,
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

    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, baselineReadNo, membersLoading),
        [messages, viewer, names, baselineReadNo, membersLoading]
    );

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
                    (n, c) => ((c.chatNo ?? 0) > seenMaxRef.current && c.ownerId !== viewer.uid ? n + 1 : n),
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
        // New tail message (or first load) while pinned to bottom → follow it.
        if (grew && atBottom) bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages, atBottom, maxChatNo, viewer.uid]);

    // After sending, snap to the latest even if the reader had scrolled up; the
    // follow-on-grow path then keeps tracking the optimistic message.
    useEffect(() => {
        if (!scrollSignal) return;
        setAtBottom(true);
        bottomRef.current?.scrollIntoView({ block: 'end' });
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
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-sm font-medium text-foreground">{t('chat.threadEmpty')}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t('chat.threadEmptyHint')}</p>
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
                                <span className="h-px flex-1 bg-destructive/40" />
                                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                                    {t('chat.newMessages')}
                                </span>
                                <span className="h-px flex-1 bg-destructive/40" />
                            </div>
                        );
                    }
                    return <MessageRow key={row.group.key} group={row.group} onRetry={onRetry} />;
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
                        className="absolute bottom-4 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary pl-3 pr-2.5 text-xs font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ChevronDown size={18} />
                    </button>
                ))}
        </div>
    );
};
