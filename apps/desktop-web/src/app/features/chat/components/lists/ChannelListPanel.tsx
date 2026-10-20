import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Plus, Search } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

import { bareChannelName, formatListTime, messagePreview } from '../../../../shared';
import { useLastChats } from '../../hooks';
import { isDmBucket, sortByRecency } from '../../utils';

interface ChannelListPanelProps {
    /** The active place's channels; its DMs are left to the DM list. */
    channels: DomainChannel[];
    selectedChannelId: string | null;
    onSelect: (channelId: string) => void;
    /** Absent where channels cannot be created (the default cloud, a guest). */
    onCreateChannel?: () => void;
    /** While the place's channels load, an empty list is not yet an empty place. */
    isLoading?: boolean;
}

const ChannelRow = memo(function ChannelRow({
    channel,
    lastChat,
    isActive,
    onSelect,
}: {
    channel: DomainChannel;
    lastChat: DomainChat | undefined;
    isActive: boolean;
    onSelect: (channelId: string) => void;
}) {
    const { t } = useTranslation();
    const unread = channel.unreadCount ?? 0;
    const name = bareChannelName(channel.name);
    const preview = lastChat ? messagePreview(lastChat) : '';
    const sender = lastChat?.owner$?.name;
    return (
        <li>
            <button
                type="button"
                aria-current={isActive || undefined}
                onClick={() => onSelect(channel.id)}
                className={cn(
                    'focus-ring flex h-[3.75rem] w-full items-center gap-3 rounded-xl pl-2.5 pr-3 text-left transition-colors ease-tactile',
                    isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent'
                )}
            >
                <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-well text-foreground"
                >
                    <Hash size={18} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                        <span
                            className={cn(
                                'truncate text-callout text-foreground',
                                unread > 0 ? 'font-bold' : 'font-semibold'
                            )}
                        >
                            {name}
                        </span>
                        <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                            {formatListTime(lastChat ? Number(lastChat.createdAtMs ?? lastChat.createdAt) : undefined)}
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="truncate text-caption text-muted-foreground">
                            {preview
                                ? sender
                                    ? t('lists.previewFrom', { name: sender, text: preview })
                                    : preview
                                : t('lists.noMessages')}
                        </span>
                        {unread > 0 && (
                            <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-unread px-1 text-tiny font-semibold tabular-nums text-badge-unread-foreground">
                                <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
                                <span className="sr-only">{t('sidebar.unreadCount', { count: unread })}</span>
                            </span>
                        )}
                    </span>
                </span>
            </button>
        </li>
    );
});

/**
 * The Channels destination's sidebar column: the place's channels, most recently active first,
 * each with its last message, its time and its unread count, filtered by name from the search
 * field. Previews come from one cache observation for the whole list (`useLastChats`).
 */
export const ChannelListPanel = ({
    channels,
    selectedChannelId,
    onSelect,
    onCreateChannel,
    isLoading = false,
}: ChannelListPanelProps) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const rooms = useMemo(() => channels.filter(channel => channel.id && !isDmBucket(channel)), [channels]);
    const lastByChannel = useLastChats(rooms);
    const ordered = useMemo(() => sortByRecency(rooms, lastByChannel), [rooms, lastByChannel]);
    const needle = query.trim().toLowerCase();
    const shown = needle
        ? ordered.filter(channel => bareChannelName(channel.name).toLowerCase().includes(needle))
        : ordered;

    return (
        <section aria-label={t('lists.channels.title')} className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-[4.25rem] shrink-0 items-center justify-between gap-2 pl-5 pr-3.5">
                <h2 className="truncate text-headline font-bold text-sidebar-foreground">
                    {t('lists.channels.title')}
                </h2>
                {onCreateChannel && (
                    <button
                        type="button"
                        aria-label={t('lists.channels.create')}
                        onClick={onCreateChannel}
                        className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                    >
                        <Plus size={18} aria-hidden />
                    </button>
                )}
            </header>
            {rooms.length > 0 && (
                <div className="flex h-12 shrink-0 items-center px-4">
                    <label className="flex w-full items-center gap-2 rounded-full bg-well px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                        <Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                        <input
                            type="search"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder={t('lists.channels.search')}
                            aria-label={t('lists.channels.search')}
                            className="min-w-0 flex-1 bg-transparent text-callout text-foreground outline-none placeholder:text-placeholder"
                        />
                    </label>
                </div>
            )}
            {rooms.length === 0 && isLoading ? null : rooms.length === 0 ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
                >
                    <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                        <Hash size={32} aria-hidden />
                    </span>
                    <p className="text-heading text-foreground">{t('lists.channels.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('lists.channels.emptyHint')}</p>
                    {onCreateChannel && (
                        <button
                            type="button"
                            onClick={onCreateChannel}
                            className="focus-ring tactile mt-3 flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-semibold text-primary-foreground transition-colors ease-tactile hover:bg-primary/90"
                        >
                            <Plus size={14} aria-hidden />
                            {t('lists.channels.create')}
                        </button>
                    )}
                </div>
            ) : shown.length === 0 ? (
                <p role="status" className="px-6 py-8 text-center text-caption text-muted-foreground">
                    {t('lists.channels.noMatch', { query: query.trim() })}
                </p>
            ) : (
                <ul className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-6">
                    {shown.map(channel => (
                        <ChannelRow
                            key={channel.id}
                            channel={channel}
                            lastChat={lastByChannel.get(channel.id)}
                            isActive={channel.id === selectedChannelId}
                            onSelect={onSelect}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
};
