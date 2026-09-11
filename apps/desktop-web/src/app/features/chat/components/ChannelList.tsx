import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Pencil, Plus, Star } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { runtime } from '@chatic/app-runtime';
import { applyChannelOrder, moveChannel, placeScopeKey, useChannelOrder, usePinnedChannels } from '@chatic/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Hint,
    Skeleton,
    avatarStyle,
    dmCounterpartId,
    isSelfChannel,
    lastChatNoOf,
    resolveDisplay,
    messagePlainText,
    useAuthorNames,
    migrateLegacyFavorites,
    useComposerDraftStore,
    useSelectedChannelStore,
    useSiteProfileMap,
} from '../../../shared';
import { SearchDialog } from '../../search';
import { ChannelActionDialogs, useChannelActions } from '../../channels';
import { useLastChat } from '../hooks';
import { useSidebarSectionsStore } from '../stores';
import { isDmBucket, sidebarMoveChord, unreadIndicator } from '../utils';
import { ChannelRowMenu } from './ChannelRowMenu';
import { QuickSwitcher } from './QuickSwitcher';
import { SortableSection, type SectionItem } from './SortableSection';

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
 * Which sidebar section a channel belongs to — the shared predicate in
 * `../utils/dmBucket`; the same call also gates the row menu's DM items.
 */

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

/** Rows wait longer than the app-wide 300ms hint: skimming the list should not pop a tooltip on every row. */
export const CHANNEL_ROW_HINT_DELAY_MS = 600;

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
        <Hint label={preview ? `${label}\n${preview}` : label} delayDuration={CHANNEL_ROW_HINT_DELAY_MS} side="right">
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
    // Favorites live on the shared `ui.pinnedChannels` record (the same one apps/web writes),
    // scoped to the active place — `pinnedIds` array order is the Favorites display order.
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const pinScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { pinnedIds, reorder: reorderPinned, toggle: togglePinned } = usePinnedChannels(pinScope);
    // Non-favorite display order comes from `ui.channelOrder` (one array: channels then DMs).
    const { storedIds: storedChannelOrder, set: setStoredChannelOrder } = useChannelOrder(pinScope);
    // Lazy legacy migration: ids this place confirms move to `ui.pinnedChannels` the first time
    // its list is on screen; other places' ids stay in the old key until their place loads.
    useEffect(() => {
        if (isLoading || !pinScope) return;
        migrateLegacyFavorites(pinScope, channels.map(c => c.id ?? '').filter(Boolean));
    }, [pinScope, isLoading, channels]);
    // Keep the selected channel visible (e.g. when moved by keyboard nav).
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedChannelId]);

    // ONE actions instance + ONE dialog stack for every row menu (the per-row
    // alternative would mount a dialog per channel). menuTargetId is set when a
    // menu opens; delete/leave run against that row.
    const [menuTargetId, setMenuTargetId] = useState<string | null>(null);
    const clearChannel = useSelectedChannelStore(s => s.clearChannel);
    const menuActions = useChannelActions(menuTargetId, {
        onRemoved: () => {
            // Leave/delete from a row only clears the selection when that row
            // is the open channel.
            if (menuTargetId && menuTargetId === selectedChannelId) clearChannel();
        },
    });

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

    // Filter AFTER identity resolution so a DM matches its display name too, then apply the
    // stored order BY ID (applyChannelOrder takes ids — review-03 P0): stored ids first (in
    // stored order), unknown/new ids in name order behind. Map back to rows right after.
    const dmRows = dms.map(channel => ({ channel, identity: dmIdentity(channel) }));
    const dmById = new Map(dmRows.map(dm => [dm.channel.id ?? '', dm]));
    const chById = new Map(regular.map(c => [c.id ?? '', c]));
    const orderedChannelIds = applyChannelOrder(
        regular.filter(c => matchesQuery(c, c.name ?? c.id ?? '')).map(c => c.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    );
    const orderedDmIds = applyChannelOrder(
        dms.filter(c => matchesQuery(c, dmById.get(c.id ?? '')?.identity.label ?? '')).map(c => c.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    );
    const visibleRegular = orderedChannelIds.flatMap(id => {
        const c = chById.get(id);
        return c ? [c] : [];
    });
    const visibleDms = orderedDmIds.flatMap(id => {
        const dm = dmById.get(id);
        return dm ? [dm] : [];
    });

    if (visibleRegular.length + visibleDms.length === 0) {
        return <div className="px-4 py-8 text-center text-callout text-muted-foreground">{t('sidebar.noMatches')}</div>;
    }

    // Keyboard nav walks the rendered order: channels first, then DMs.
    const navOrder = [...visibleRegular, ...visibleDms.map(row => row.channel)];
    // A filtered view is a subset — dragging it would write a partial order, so rows lock.
    const isFiltering = query.trim().length > 0;

    const onReorderFavorites = (keys: string[]) => {
        reorderPinned(keys.map(key => key.replace(/^fav:/, '')));
    };
    // A move rewrites only the moved section's slice; the other section keeps its stored order.
    const makeSectionReorder = (section: 'ch' | 'dm') => (keys: string[]) => {
        const orderedIds = keys.map(key => key.replace(/^(ch|dm):/, ''));
        const dmIds = new Set(dms.map(c => c.id ?? ''));
        const chIds = new Set(regular.map(c => c.id ?? ''));
        if (section === 'ch') {
            setStoredChannelOrder([...orderedIds, ...storedChannelOrder.filter(id => dmIds.has(id))]);
        } else {
            setStoredChannelOrder([...storedChannelOrder.filter(id => chIds.has(id)), ...orderedIds]);
        }
    };
    // Keyboard twin of the drag: same section-slice rewrite, same fold/filter locks. A pinned
    // selection moves inside Favorites (its pin order IS the display order); moveChannel does
    // the clamp/prune that arrayMove does for the pointer path.
    const moveSelectedByKeyboard = (delta: 1 | -1) => {
        const id = selectedChannelId;
        if (!id) return;
        const { collapsed } = useSidebarSectionsStore.getState();
        if (pinnedIds.includes(id)) {
            if (collapsed.fav) return;
            const presentIds = favoriteRows.map(fav => fav.channel.id ?? '');
            const from = presentIds.indexOf(id);
            if (from < 0) return;
            reorderPinned(moveChannel(pinnedIds, id, from + delta, presentIds));
            return;
        }
        if (dmById.has(id)) {
            if (collapsed.dm) return;
            const ids = visibleDms.map(dm => dm.channel.id ?? '');
            const from = ids.indexOf(id);
            if (from < 0) return;
            makeSectionReorder('dm')(moveChannel(ids, id, from + delta, ids).map(orderedId => `dm:${orderedId}`));
            return;
        }
        if (collapsed.ch) return;
        const ids = visibleRegular.map(c => c.id ?? '');
        const from = ids.indexOf(id);
        if (from < 0) return;
        makeSectionReorder('ch')(moveChannel(ids, id, from + delta, ids).map(orderedId => `ch:${orderedId}`));
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const chord = sidebarMoveChord(e);
        if (chord !== null) {
            // Move chord, never navigation: Alt+Shift+↑/↓ reorders inside the selected row's
            // OWN section — cross-section is impossible (matches the drag rule). Swallowed
            // while filtering: a filtered view would write a partial order.
            e.preventDefault();
            if (!isFiltering) moveSelectedByKeyboard(chord);
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; // OS/browser chords pass through
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
                <ChannelRowMenu
                    channel={channel}
                    myUid={myUid}
                    isFavorite={!!isFavorite}
                    onToggleFavorite={() => togglePinned(id)}
                    openDialog={menuActions.openDialog}
                    onMenuOpen={setMenuTargetId}
                >
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
                </ChannelRowMenu>
            ),
        };
    };

    // Favorites repeat their row in its own section (Figma), so a starred channel stays
    // reachable from the top while keeping its place in Channels / DM. Display order IS the
    // stored pin order; ids not in the current list are skipped.
    const favoriteById = new Map<string, { channel: DomainChannel; label: string; icon: ReactNode }>();
    for (const c of visibleRegular) {
        favoriteById.set(c.id ?? '', { channel: c, label: c.name ?? c.id ?? '', icon: channelGlyph });
    }
    for (const dm of dmRows) favoriteById.set(dm.channel.id ?? '', { channel: dm.channel, ...dm.identity });
    const favoriteRows = pinnedIds.flatMap(id => {
        const fav = favoriteById.get(id);
        return fav ? [fav] : [];
    });

    return (
        // The switcher lives here (not HomePage) because this is where the
        // channel list + select handler already are; it renders only when opened.
        <nav aria-label={t('sidebar.channels')} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-4 pb-6 pt-3">
            <QuickSwitcher channels={channels} onSelect={onSelect} />
            <SearchDialog channels={channels} onSelect={onSelect} />
            <Divider />
            {favoriteRows.length > 0 && (
                <>
                    <SortableSection
                        id="fav"
                        title={t('sidebar.favorites')}
                        items={favoriteRows.map(fav => row(fav.channel, fav.label, fav.icon, 'fav', true))}
                        dragDisabled={isFiltering}
                        onReorder={onReorderFavorites}
                    />
                    <Divider />
                </>
            )}
            {visibleRegular.length > 0 && (
                <>
                    <SortableSection
                        id="ch"
                        title={t('sidebar.channels')}
                        items={visibleRegular.map(channel =>
                            row(channel, channel.name ?? channel.id ?? '', channelGlyph, 'ch')
                        )}
                        dragDisabled={isFiltering}
                        onReorder={makeSectionReorder('ch')}
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
                <SortableSection
                    id="dm"
                    title={t('sidebar.dms')}
                    items={visibleDms.map(dm => row(dm.channel, dm.identity.label, dm.identity.icon, 'dm'))}
                    dragDisabled={isFiltering}
                    onReorder={makeSectionReorder('dm')}
                />
            )}
            {/* The row menus' dialog stack renders ONCE here, keyed to the last
            right-clicked row; the menu items themselves only open it. */}
            <ChannelActionDialogs
                channelId={menuTargetId ?? ''}
                channelName={channels.find(c => (c.id ?? '') === menuTargetId)?.name ?? ''}
                kickName=""
                actions={menuActions}
            />
        </nav>
    );
};
