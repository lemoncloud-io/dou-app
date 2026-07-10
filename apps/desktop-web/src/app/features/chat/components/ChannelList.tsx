import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { useTick } from '@chatic/shared';
import { useSessionIdentity } from '@chatic/web-core';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Skeleton,
    avatarStyle,
    dmCounterpartId,
    isDmChannel,
    isSelfChannel,
    lastChatNoOf,
    relativeTime,
    resolveDisplay,
    stripMarkdown,
    useAuthorNames,
    useLastChat,
    useSiteProfileMap,
} from '../../../shared';
import { SearchDialog } from '../../search';
import { QuickSwitcher } from './QuickSwitcher';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    query: string;
    onSelect: (channelId: string) => void;
    /** Default Cloud has no channel creation — the empty-state hint must not point at a "+". */
    isDefaultMode: boolean;
}

const ChannelSkeleton = () => (
    <div role="status" aria-label="Loading channels" className="flex flex-col gap-0.5 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex min-h-9 items-center gap-2 px-3 py-1.5">
                <Skeleton className="h-3 w-3 shrink-0 rounded-sm bg-muted animate-pulse" />
                <Skeleton className="h-3 bg-muted animate-pulse" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </div>
        ))}
    </div>
);

interface ChannelRowProps {
    channel: DomainChannel;
    label: string;
    icon: ReactNode;
    isActive: boolean;
    onSelect: (channelId: string) => void;
    /** Attached to the active row so keyboard nav / selection can scroll it into view. */
    rowRef?: React.Ref<HTMLButtonElement>;
}

/**
 * One channel/DM row. Owns its last-message preview via `useLastChat`, which resolves the
 * last MAIN-channel message (thread replies + system rows excluded) from the chat cache —
 * the channel record's `lastChat$` can't, as it carries whatever the newest chat is.
 */
const ChannelRow = ({ channel, label, icon, isActive, onSelect, rowRef }: ChannelRowProps) => {
    const id = channel.id ?? '';
    const unread = channel.unreadCount ?? 0;
    const hasUnread = unread > 0 && !isActive;
    const lastChat = useLastChat(id, lastChatNoOf(channel));
    // Memo the preview so the parent's minute tick (which must recompute `time`) doesn't
    // re-run stripMarkdown for every row — the preview only changes when lastChat does.
    const preview = useMemo(() => stripMarkdown(lastChat?.content?.trim() ?? ''), [lastChat]);
    const time = relativeTime(lastChat?.createdAt ?? channel.lastActivityAt);
    return (
        <button
            ref={rowRef}
            onClick={() => onSelect(id)}
            title={label}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
                'focus-ring relative flex min-h-9 min-w-0 flex-col justify-center gap-0.5 rounded-md px-3 py-1.5 text-left transition-colors duration-150 ease-tactile',
                isActive ? 'bg-primary/12' : 'hover:bg-accent/50'
            )}
        >
            {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
            )}
            <span className="flex w-full items-center gap-2">
                <span className={cn('shrink-0', isActive ? 'text-primary-ink' : 'text-muted-foreground')}>{icon}</span>
                <span
                    className={cn(
                        'min-w-0 flex-1 truncate',
                        isActive
                            ? 'text-callout font-bold text-foreground'
                            : hasUnread
                              ? 'text-callout font-semibold text-foreground'
                              : 'text-callout text-muted-foreground'
                    )}
                >
                    {label}
                </span>
                {time && (
                    <span
                        className={cn(
                            'shrink-0 text-micro tabular-nums',
                            isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        {time}
                    </span>
                )}
                {hasUnread && (
                    <span className="shrink-0 rounded-full bg-badge-unread px-1.5 text-caption font-semibold tabular-nums text-badge-unread-foreground">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </span>
            {preview && (
                <span
                    className={cn(
                        'w-full min-w-0 truncate pl-5 text-micro',
                        isActive || hasUnread ? 'text-foreground' : 'text-muted-foreground'
                    )}
                >
                    {preview}
                </span>
            )}
        </button>
    );
};

export const ChannelList = ({
    channels,
    isLoading,
    selectedChannelId,
    query,
    onSelect,
    isDefaultMode,
}: ChannelListProps) => {
    const { t } = useTranslation();
    const myUid = useSessionIdentity().userId;
    const placeProfiles = useSiteProfileMap();
    // Tick once a minute so the relative "11m" preview times stay current.
    useTick(60_000);
    // Keep the selected channel visible (e.g. when moved by keyboard nav).
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedChannelId]);

    // Slack-style sections: named channels, then DMs (self channel included).
    const { regular, dms } = useMemo(() => {
        const split = { regular: [] as DomainChannel[], dms: [] as DomainChannel[] };
        for (const channel of channels) {
            (isDmChannel(channel) || isSelfChannel(channel) ? split.dms : split.regular).push(channel);
        }
        return split;
    }, [channels]);

    // DM rows label as the other party — resolve their name from the user cache
    // (Place Profile nick wins, same as message authors).
    const counterpartIds = useMemo(
        () => dms.map(c => dmCounterpartId(c, myUid, c.$join?.userId)).filter((id): id is string => !!id),
        [dms, myUid]
    );
    const counterpartNames = useAuthorNames(counterpartIds);

    /** Display identity for a DM/self row: label + avatar in place of the # glyph. */
    const dmIdentity = (channel: DomainChannel): { label: string; icon: ReactNode } => {
        if (isSelfChannel(channel)) {
            return {
                label: t('dm.you'),
                icon: (
                    <Avatar className="h-5 w-5 shrink-0 rounded">
                        <AvatarFallback className="rounded text-[9px] font-semibold" style={avatarStyle(myUid ?? 'me')}>
                            {t('dm.you').charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                ),
            };
        }
        const counterpartId = dmCounterpartId(channel, myUid, channel.$join?.userId) ?? '';
        const display = resolveDisplay(
            counterpartId ? placeProfiles[counterpartId] : undefined,
            counterpartNames.get(counterpartId) ?? channel.name ?? counterpartId,
            undefined
        );
        return {
            label: display.name || (channel.name ?? channel.id ?? ''),
            icon: (
                <Avatar className="h-5 w-5 shrink-0 rounded">
                    {display.thumbnail && <AvatarImage src={display.thumbnail} alt={display.name} />}
                    <AvatarFallback
                        className="rounded text-[9px] font-semibold"
                        style={avatarStyle(counterpartId || display.name)}
                    >
                        {display.name.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                </Avatar>
            ),
        };
    };

    const matchesQuery = (channel: DomainChannel, label: string): boolean => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return label.toLowerCase().includes(q) || (channel.name ?? channel.id ?? '').toLowerCase().includes(q);
    };

    if (isLoading) return <ChannelSkeleton />;

    if (channels.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-hairline bg-well text-lg text-muted-foreground shadow-well">
                    #
                </span>
                <span className="text-callout text-foreground">{t('chat.noChannels')}</span>
                <span className="text-caption text-muted-foreground">
                    {t(isDefaultMode ? 'chat.noChannelsHintDefault' : 'chat.noChannelsHint')}
                </span>
            </div>
        );
    }

    // Filter AFTER identity resolution so a DM matches its display name too.
    const visibleRegular = regular.filter(c => matchesQuery(c, c.name ?? c.id ?? ''));
    const dmRows = dms.map(channel => ({ channel, identity: dmIdentity(channel) }));
    const visibleDms = dmRows.filter(row => matchesQuery(row.channel, row.identity.label));

    if (visibleRegular.length + visibleDms.length === 0) {
        return <div className="px-4 py-8 text-center text-callout text-muted-foreground">{t('sidebar.noMatches')}</div>;
    }

    // Keyboard nav walks the rendered order: channels first, then DMs.
    const navOrder = [...visibleRegular, ...visibleDms.map(row => row.channel)];
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const idx = navOrder.findIndex(c => (c.id ?? '') === selectedChannelId);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIdx = idx < 0 ? 0 : Math.min(navOrder.length - 1, Math.max(0, idx + delta));
        const next = navOrder[nextIdx]?.id;
        if (next) onSelect(next);
    };

    const row = (channel: DomainChannel, label: string, icon: ReactNode) => {
        const id = channel.id ?? '';
        const isActive = id === selectedChannelId;
        return (
            <ChannelRow
                key={id}
                channel={channel}
                label={label}
                icon={icon}
                isActive={isActive}
                onSelect={onSelect}
                rowRef={isActive ? activeRef : undefined}
            />
        );
    };

    return (
        // The switcher lives here (not HomePage) because this is where the
        // channel list + select handler already are; it renders only when opened.
        <nav aria-label={t('sidebar.channels')} onKeyDown={onKeyDown} className="flex flex-col gap-0.5 p-2">
            <QuickSwitcher channels={channels} onSelect={onSelect} />
            <SearchDialog channels={channels} onSelect={onSelect} />
            {visibleRegular.map(channel => row(channel, channel.name ?? channel.id ?? '', '#'))}
            {visibleDms.length > 0 && (
                <h3 className="mb-1 mt-3 px-3 text-overline text-muted-foreground">{t('sidebar.dms')}</h3>
            )}
            {visibleDms.map(dm => row(dm.channel, dm.identity.label, dm.identity.icon))}
        </nav>
    );
};
