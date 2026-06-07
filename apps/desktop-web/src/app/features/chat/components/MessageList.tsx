import { useEffect, useMemo, useRef, useState } from 'react';
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
    /** Read position when the channel was opened — drives the "new messages" divider. */
    baselineReadNo?: number;
    onRetry?: (message: DomainChat) => void;
}

const NEAR_BOTTOM_PX = 80;

export const MessageList = ({ messages, isLoading, viewer, names, baselineReadNo, onRetry }: MessageListProps) => {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [atBottom, setAtBottom] = useState(true);

    const rows = useMemo(
        () => buildMessageRows(messages, viewer, names, baselineReadNo),
        [messages, viewer, names, baselineReadNo]
    );

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages.length]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
    };

    const scrollToBottom = () => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });

    if (isLoading) {
        return (
            <div role="status" aria-live="polite" aria-label={t('chat.loading')} className="flex flex-1 flex-col gap-5 overflow-hidden p-4">
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

    return (
        <div className="relative flex flex-1 flex-col overflow-hidden">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto p-4"
            >
                {rows.map(row => {
                    if (row.kind === 'date') return <DateSeparator key={row.key} timestamp={row.timestamp} />;
                    if (row.kind === 'unread') {
                        return (
                            <div key={row.key} className="my-1 flex items-center gap-2 px-2">
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
            {!atBottom && (
                <button
                    type="button"
                    onClick={scrollToBottom}
                    aria-label={t('chat.jumpToLatest')}
                    title={t('chat.jumpToLatest')}
                    className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronDown size={18} />
                </button>
            )}
        </div>
    );
};
