import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    query: string;
    onSelect: (channelId: string) => void;
}

const ChannelSkeleton = () => (
    <div role="status" aria-label="Loading channels" className="flex flex-col gap-1 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
                <span className="h-3 w-3 shrink-0 rounded-sm bg-muted" />
                <span className="h-3 rounded bg-muted" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </div>
        ))}
    </div>
);

export const ChannelList = ({ channels, isLoading, selectedChannelId, query, onSelect }: ChannelListProps) => {
    const { t } = useTranslation();

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

    return (
        <nav aria-label={t('sidebar.channels')} className="flex flex-col gap-0.5 p-2">
            {filtered.map(channel => {
                const id = channel.id ?? '';
                const isActive = id === selectedChannelId;
                const unread = channel.unreadCount ?? 0;
                const hasUnread = unread > 0 && !isActive;
                return (
                    <button
                        key={id}
                        onClick={() => onSelect(id)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
                            isActive
                                ? 'bg-primary/15 font-semibold text-foreground'
                                : hasUnread
                                  ? 'font-semibold text-foreground hover:bg-accent'
                                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        <span className={cn('shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}>#</span>
                        <span className="truncate">{channel.name ?? id}</span>
                        {hasUnread && (
                            <span className="ml-auto shrink-0 rounded-full bg-badge-unread px-1.5 text-[11px] font-semibold tabular-nums text-badge-unread-foreground">
                                {unread > 99 ? '99+' : unread}
                            </span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
};
