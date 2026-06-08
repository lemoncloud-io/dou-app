import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { useTick } from '@chatic/shared';

import { Skeleton, relativeTime } from '../../../shared';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    query: string;
    /** Signed-in user id — prefixes own last message with "You". */
    myUid: string | null;
    onSelect: (channelId: string) => void;
}

/** "You: hi" / "Jane: hi" / "hi" — author prefix on the channel's last message. */
const lastMessagePreview = (channel: DomainChannel, myUid: string | null, you: string): string => {
    const last = channel.lastChat$;
    const text = last?.content?.trim();
    if (!text) return '';
    const author = myUid && last?.ownerId === myUid ? you : last?.owner$?.name;
    return author ? `${author}: ${text}` : text;
};

const ChannelSkeleton = () => (
    <div role="status" aria-label="Loading channels" className="flex flex-col gap-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
                <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
                <Skeleton className="h-3" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </div>
        ))}
    </div>
);

export const ChannelList = ({ channels, isLoading, selectedChannelId, query, myUid, onSelect }: ChannelListProps) => {
    const { t } = useTranslation();
    // Tick once a minute so the relative "11m" preview times stay current.
    useTick(60_000);
    // Keep the selected channel visible (e.g. when moved by keyboard nav).
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedChannelId]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return channels;
        return channels.filter(c => (c.name ?? c.id ?? '').toLowerCase().includes(q));
    }, [channels, query]);

    if (isLoading) return <ChannelSkeleton />;

    if (channels.length === 0) {
        return (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                <span className="text-sm font-medium text-foreground">{t('chat.noChannels')}</span>
                <span className="text-xs text-muted-foreground">{t('chat.noChannelsHint')}</span>
            </div>
        );
    }

    if (filtered.length === 0) {
        return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{t('sidebar.noMatches')}</div>;
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const idx = filtered.findIndex(c => (c.id ?? '') === selectedChannelId);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = idx < 0 ? 0 : Math.min(filtered.length - 1, Math.max(0, idx + delta));
        const next = filtered[nextIdx]?.id;
        if (next) onSelect(next);
    };

    return (
        <nav aria-label={t('sidebar.channels')} onKeyDown={onKeyDown} className="flex flex-col gap-0.5 p-2">
            {filtered.map(channel => {
                const id = channel.id ?? '';
                const isActive = id === selectedChannelId;
                const unread = channel.unreadCount ?? 0;
                const hasUnread = unread > 0 && !isActive;
                const preview = lastMessagePreview(channel, myUid, t('chat.you'));
                const time = relativeTime(channel.lastChat$?.createdAt ?? channel.lastActivityAt);
                return (
                    <button
                        key={id}
                        ref={isActive ? activeRef : undefined}
                        onClick={() => onSelect(id)}
                        title={channel.name ?? id}
                        aria-current={isActive ? 'true' : undefined}
                        className={cn(
                            'relative flex flex-col gap-0.5 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
                            isActive ? 'bg-primary/15' : 'hover:bg-accent'
                        )}
                    >
                        {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                        )}
                        <span className="flex w-full items-center gap-2">
                            <span className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}>
                                #
                            </span>
                            <span
                                className={cn(
                                    'min-w-0 flex-1 truncate',
                                    isActive || hasUnread ? 'font-semibold text-foreground' : 'text-muted-foreground'
                                )}
                            >
                                {channel.name ?? id}
                            </span>
                            {time && (
                                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                                    {time}
                                </span>
                            )}
                            {hasUnread && (
                                <span className="shrink-0 rounded-full bg-badge-unread px-1.5 text-[11px] font-semibold tabular-nums text-badge-unread-foreground">
                                    {unread > 99 ? '99+' : unread}
                                </span>
                            )}
                        </span>
                        {preview && (
                            <span
                                className={cn(
                                    'truncate pl-5 text-xs',
                                    hasUnread ? 'text-foreground/80' : 'text-muted-foreground/70'
                                )}
                            >
                                {preview}
                            </span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
};
