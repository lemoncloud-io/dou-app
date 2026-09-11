import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, Hash, Pencil, Plus, Star } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Hint,
    Skeleton,
    avatarStyle,
    dmCounterpartId,
    isDmChannel,
    isSelfChannel,
    lastChatNoOf,
    resolveDisplay,
    messagePlainText,
    useAuthorNames,
    useFavoriteChannelsStore,
    useComposerDraftStore,
    useSiteProfileMap,
} from '../../../shared';
import { SearchDialog } from '../../search';
import { useLastChat } from '../hooks';
import { useSidebarSectionsStore } from '../stores';
import { unreadIndicator } from '../utils';
import { QuickSwitcher } from './QuickSwitcher';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    query: string;
    onSelect: (channelId: string) => void;
    /** Default Cloud has no channel creation — the empty-state hint must not point at a "+". */
    isDefaultMode: boolean;
    /** The Channels section's "+" (hidden on the Default Cloud, which cannot create channels). */
    onCreateChannel?: () => void;
}

const ChannelSkeleton = () => (
    <div role="status" aria-label="Loading channels" className="flex flex-col gap-2 px-4 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex h-[34px] items-center gap-2 p-2">
                <Skeleton className="h-3 w-3 shrink-0 rounded-sm bg-muted animate-pulse" />
                <Skeleton className="h-3 bg-muted animate-pulse" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
            </div>
        ))}
    </div>
);

/**
 * Which sidebar section a channel belongs to. Also decides its unread badge
 * shape, so section and badge are the same call rather than two claims that
 * happen to agree.
 */
const isDmBucket = (channel: DomainChannel): boolean => isDmChannel(channel) || isSelfChannel(channel);

interface ChannelRowProps {
    channel: DomainChannel;
    label: string;
    icon: ReactNode;
    isActive: boolean;
    /** Favorites section row: carries the star instead of relying on the header toggle. */
    isFavorite?: boolean;
    onSelect: (channelId: string) => void;
    /** Attached to the active row so keyboard nav / selection can scroll it into view. */
    rowRef?: React.Ref<HTMLButtonElement>;
}

/**
 * One channel/DM row (Figma: 34px, glyph · name · trailing badge or star).
 *
 * The row is a single line; the last real message rides along as its tooltip (the
 * row's `title` — kept out of the accessible name, which stays the channel's). It
 * comes from `useLastChat`, which resolves the newest previewable message from the
 * chat cache — thread replies, reaction events and system rows excluded. The channel
 * record's `lastChat$` cannot stand in: it carries whatever the newest chat is, so a
 * reaction to an old message would become the preview.
 *
 * The unread marker's *shape* is `unreadIndicator`'s single call — the row never
 * re-derives "is there something unread" for the name emphasis, or the two would
 * drift apart the moment one of them grew a condition.
 */
const ChannelRow = ({ channel, label, icon, isActive, isFavorite, onSelect, rowRef }: ChannelRowProps) => {
    const { t } = useTranslation();
    const id = channel.id ?? '';
    const unread = channel.unreadCount ?? 0;
    const indicator = unreadIndicator({ unread, isDm: isDmBucket(channel), isActive });
    const lastChat = useLastChat(id, lastChatNoOf(channel));
    // Slack's draft pencil: text left in another channel's composer is easy to forget.
    // Not on the open row — its composer is right there.
    const hasDraft = useComposerDraftStore(s => !isActive && !!s.drafts[id]?.trim());
    // A deleted message keeps its place here and says so, the way the feed does: its
    // content survives the soft delete, and printing it would show text the row itself
    // says is gone.
    const preview = useMemo(
        () => (lastChat?.hidden ? t('sidebar.deletedPreview') : messagePlainText(lastChat?.content?.trim())),
        [lastChat, t]
    );
    return (
        <Hint label={preview ? `${label}\n${preview}` : label} delayDuration={600} side="right">
            <button
                ref={rowRef}
                onClick={() => onSelect(id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                    'focus-ring flex h-[34px] w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors duration-150 ease-tactile',
                    isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent'
                )}
            >
                <span className="flex shrink-0 items-center text-foreground">{icon}</span>
                <span
                    className={cn(
                        'min-w-0 flex-1 truncate text-[14px] tracking-[-0.01em] text-sidebar-foreground',
                        indicator !== 'none' && 'font-semibold'
                    )}
                >
                    {label}
                </span>
                {hasDraft && (
                    <span className="flex shrink-0 items-center text-muted-foreground">
                        <Pencil size={14} aria-hidden />
                        <span className="sr-only">{t('sidebar.draft')}</span>
                    </span>
                )}
                {/* The mark is decorative; the sr-only text carries it. Deliberately NOT
                role="status" — that is a live region, and one per unread row would make
                a screen reader announce the whole sidebar every time a count moved. */}
                {indicator === 'dot' && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-badge-unread">
                        <span className="sr-only">{t('sidebar.unread')}</span>
                    </span>
                )}
                {indicator === 'count' && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-unread px-1 text-[11px] font-semibold tabular-nums text-badge-unread-foreground">
                        <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
                        <span className="sr-only">{t('sidebar.unreadCount', { count: unread })}</span>
                    </span>
                )}
                {isFavorite && indicator === 'none' && (
                    // The star is the one warm accent in the sidebar (--favorite, Figma Colors/Orange).
                    <Star size={16} aria-hidden className="shrink-0 fill-favorite text-favorite" />
                )}
            </button>
        </Hint>
    );
};

interface SectionItem {
    key: string;
    node: ReactNode;
    /** Stays visible while the section is folded: the open channel, or one with unread. */
    keepWhenCollapsed: boolean;
}

interface SectionProps {
    /** Persisted fold key (`useSidebarSectionsStore`). */
    id: string;
    title: string;
    /** Trailing control in the header row (the Channels "+"). */
    action?: ReactNode;
    items: SectionItem[];
}

/**
 * Collapsible sidebar section (Figma: chevron · 16px semibold title · optional action).
 *
 * Folding hides the quiet rows, not the ones asking for attention: like Slack, the open
 * channel and anything unread stay listed, so folding a busy section never hides that
 * something arrived. The fold is remembered across launches.
 */
const Section = ({ id, title, action, items }: SectionProps) => {
    const isCollapsed = useSidebarSectionsStore(s => !!s.collapsed[id]);
    const toggle = useSidebarSectionsStore(s => s.toggle);
    const visible = isCollapsed ? items.filter(item => item.keepWhenCollapsed) : items;
    return (
        <section className="flex flex-col gap-1">
            <div className="flex items-center gap-2 py-3">
                <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={!isCollapsed}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
                >
                    <ChevronDown
                        size={18}
                        aria-hidden
                        className={cn(
                            'shrink-0 text-sidebar-foreground transition-transform duration-150 ease-tactile',
                            isCollapsed && '-rotate-90'
                        )}
                    />
                    <h3 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                        {title}
                    </h3>
                </button>
                {action}
            </div>
            {visible.length > 0 && (
                <div className="flex flex-col gap-2">
                    {visible.map(item => (
                        <Fragment key={item.key}>{item.node}</Fragment>
                    ))}
                </div>
            )}
        </section>
    );
};

const Divider = () => <div aria-hidden className="h-px w-full shrink-0 bg-hairline" />;

export const ChannelList = ({
    channels,
    isLoading,
    selectedChannelId,
    query,
    onSelect,
    isDefaultMode,
    onCreateChannel,
}: ChannelListProps) => {
    const { t } = useTranslation();
    const myUid = runtime.session.useSessionIdentity().userId;
    const placeProfiles = useSiteProfileMap();
    const favoriteIds = useFavoriteChannelsStore(s => s.ids);
    // Keep the selected channel visible (e.g. when moved by keyboard nav).
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedChannelId]);

    // Slack-style sections: named channels, then DMs (self channel included).
    const { regular, dms } = useMemo(() => {
        const split = { regular: [] as DomainChannel[], dms: [] as DomainChannel[] };
        for (const channel of channels) {
            (isDmBucket(channel) ? split.dms : split.regular).push(channel);
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
                    <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[10px] font-semibold" style={avatarStyle(myUid ?? 'me')}>
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
                <Avatar className="h-6 w-6 shrink-0">
                    {display.thumbnail && <AvatarImage src={display.thumbnail} alt={display.name} />}
                    <AvatarFallback
                        className="text-[10px] font-semibold"
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
                {/* The Channels section (and its "+") only renders with channels in it, so the
                    empty state carries the create action itself. */}
                {!isDefaultMode && onCreateChannel && (
                    <button
                        type="button"
                        onClick={onCreateChannel}
                        className="focus-ring tactile mt-1 flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-callout font-medium text-foreground transition-colors hover:bg-accent"
                    >
                        <Plus size={16} aria-hidden />
                        {t('rail.addChannel')}
                    </button>
                )}
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

    const channelGlyph = <Hash size={16} aria-hidden />;
    const row = (
        channel: DomainChannel,
        label: string,
        icon: ReactNode,
        section: string,
        isFavorite?: boolean
    ): SectionItem => {
        const id = channel.id ?? '';
        const isActive = id === selectedChannelId;
        return {
            key: `${section}:${id}`,
            keepWhenCollapsed: isActive || (channel.unreadCount ?? 0) > 0,
            node: (
                <ChannelRow
                    channel={channel}
                    label={label}
                    icon={icon}
                    isActive={isActive}
                    isFavorite={isFavorite}
                    onSelect={onSelect}
                    // Only the canonical (non-favorite) row owns the scroll anchor.
                    rowRef={isActive && !isFavorite ? activeRef : undefined}
                />
            ),
        };
    };

    // Favorites repeat their row in its own section (Figma), so a starred channel stays
    // reachable from the top while keeping its place in Channels / DM.
    const favoriteRows = [
        ...visibleRegular
            .filter(c => favoriteIds[c.id ?? ''])
            .map(c => ({ channel: c, label: c.name ?? c.id ?? '', icon: channelGlyph })),
        ...visibleDms
            .filter(dm => favoriteIds[dm.channel.id ?? ''])
            .map(dm => ({ channel: dm.channel, ...dm.identity })),
    ];

    return (
        // The switcher lives here (not HomePage) because this is where the
        // channel list + select handler already are; it renders only when opened.
        <nav aria-label={t('sidebar.channels')} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-4 pb-6 pt-3">
            <QuickSwitcher channels={channels} onSelect={onSelect} />
            <SearchDialog channels={channels} onSelect={onSelect} />
            <Divider />
            {favoriteRows.length > 0 && (
                <>
                    <Section
                        id="fav"
                        title={t('sidebar.favorites')}
                        items={favoriteRows.map(fav => row(fav.channel, fav.label, fav.icon, 'fav', true))}
                    />
                    <Divider />
                </>
            )}
            {visibleRegular.length > 0 && (
                <>
                    <Section
                        id="ch"
                        title={t('sidebar.channels')}
                        items={visibleRegular.map(channel =>
                            row(channel, channel.name ?? channel.id ?? '', channelGlyph, 'ch')
                        )}
                        action={
                            // Default Cloud (Self Channel only) does not support channel creation.
                            !isDefaultMode &&
                            onCreateChannel && (
                                <Hint label={t('rail.addChannel')}>
                                    <button
                                        type="button"
                                        onClick={onCreateChannel}
                                        aria-label={t('rail.addChannel')}
                                        className="focus-ring tactile flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors ease-tactile hover:bg-accent"
                                    >
                                        <Plus size={16} aria-hidden />
                                    </button>
                                </Hint>
                            )
                        }
                    />
                    {visibleDms.length > 0 && <Divider />}
                </>
            )}
            {visibleDms.length > 0 && (
                <Section
                    id="dm"
                    title={t('sidebar.dms')}
                    items={visibleDms.map(dm => row(dm.channel, dm.identity.label, dm.identity.icon, 'dm'))}
                />
            )}
        </nav>
    );
};
