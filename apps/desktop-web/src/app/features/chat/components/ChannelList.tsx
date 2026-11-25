import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AtSign, BellOff, Hash, Pencil, Plus, Star } from 'lucide-react';

import { RELAY_CLOUD_ID, type DomainChannel, runtime } from '@chatic/runtime';
import { cn, Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit';
import { applyChannelOrder, moveChannel, placeScopeKey, useChannelOrder, usePinnedChannels } from '@chatic/shared';

import {
    Hint,
    Skeleton,
    avatarStyle,
    bareChannelName,
    isSelfChannel,
    lastChatNoOf,
    MobileAppPointer,
    messagePreview,
    channelNotifyMode,
    channelReadNo,
    hasUnreadMentionIn,
    isNotifyDm,
    useComposerDraftStore,
    useMentionsStore,
    useNotificationPrefsStore,
    useReadCursorStore,
    useSelectedChannelStore,
} from '../../../shared';
import { SearchDialog } from '../../search';
import { ChannelActionDialogs, useChannelActions } from '../../channels';
import { useDmIdentities, useLastChat } from '../hooks';
import { useSidebarOrderStore, useSidebarSectionsStore } from '../stores';
import { isDmBucket, sidebarMoveChord, unreadIndicator } from '../utils';
import { ChannelRowMenu } from './ChannelRowMenu';
import { QuickSwitcher, type ElsewhereChannel } from './QuickSwitcher';
import { SortableSection, type SectionItem } from './SortableSection';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    query: string;
    onSelect: (channelId: string) => void;
    onJumpToMessage?: (channelId: string, chatNo: number, threadRootId?: string) => void;
    elsewhereChannels?: ElsewhereChannel[];
    onSelectElsewhere?: (channelId: string, placeId: string) => void;
    isDefaultMode: boolean;
    onCreateChannel?: () => void;
    onCreateDm?: () => void;
    memberPeers?: ReadonlyArray<{ peerId: string; channelId: string }>;
    onStartDm?: (peerId: string) => void;
    startingPeerId?: string | null;
}

const ChannelSkeleton = () => {
    const { t } = useTranslation();
    return (
        <div role="status" aria-label={t('chat.loadingChannels')} className="flex flex-col gap-2 px-4 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex h-9 items-center gap-2 p-2">
                    <Skeleton className="h-3 w-3 shrink-0 rounded-sm bg-muted animate-pulse" />
                    <Skeleton className="h-3 bg-muted animate-pulse" style={{ width: `${45 + ((i * 13) % 40)}%` }} />
                </div>
            ))}
        </div>
    );
};

interface ChannelRowProps {
    channel: DomainChannel;
    label: string;
    icon: ReactNode;
    isActive: boolean;
    isFavorite?: boolean;
    onSelect: (channelId: string) => void;
    rowRef?: React.Ref<HTMLButtonElement>;
}

export const CHANNEL_ROW_HINT_DELAY_MS = 600;

const ChannelRow = memo(function ChannelRow({
    channel,
    label,
    icon,
    isActive,
    isFavorite,
    onSelect,
    rowRef,
}: ChannelRowProps) {
    const { t } = useTranslation();
    const id = channel.id ?? '';
    const unread = channel.unreadCount ?? 0;
    const indicator = unreadIndicator({ unread, isDm: isDmBucket(channel), isActive });
    const [wantsPreview, setWantsPreview] = useState(false);
    const lastChat = useLastChat(wantsPreview ? id : '', lastChatNoOf(channel));
    const hasDraft = useComposerDraftStore(s => !isActive && !!s.drafts[id]?.trim());
    const joinNotify = channel.$join?.notify;
    const isDm = isNotifyDm(channel);
    const notifyMode = useNotificationPrefsStore(s =>
        channelNotifyMode(s, id, joinNotify === '' ? undefined : joinNotify, isDm)
    );
    const isMuted = notifyMode !== 'all';
    const localReadNo = useReadCursorStore(s => s.cursors[id] ?? 0);
    const readNo = channelReadNo(channel, localReadNo);
    const calledMe = useMentionsStore(
        s =>
            indicator !== 'none' &&
            hasUnreadMentionIn(s.items, { cloudId: channel.cid || RELAY_CLOUD_ID, id, placeId: channel.sid }, readNo)
    );
    const preview = useMemo(
        () => (lastChat?.hidden ? t('sidebar.deletedPreview') : lastChat ? messagePreview(lastChat) : ''),
        [lastChat, t]
    );
    return (
        <Hint label={preview ? `${label}\n${preview}` : label} delayDuration={CHANNEL_ROW_HINT_DELAY_MS} side="right">
            <button
                ref={rowRef}
                onPointerEnter={() => setWantsPreview(true)}
                onFocus={() => setWantsPreview(true)}
                onClick={() => onSelect(id)}
                aria-current={isActive ? 'true' : undefined}
                data-channel-row={id}
                className={cn(
                    'focus-ring flex h-9 w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors duration-150 ease-tactile',
                    isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent'
                )}
            >
                <span className="flex shrink-0 items-center text-foreground">{icon}</span>
                <span
                    className={cn(
                        'min-w-0 flex-1 truncate text-callout',
                        isMuted ? 'text-muted-foreground' : 'text-sidebar-foreground',
                        indicator !== 'none' && 'font-semibold'
                    )}
                >
                    {label}
                </span>
                {notifyMode === 'none' && (
                    <span className="flex shrink-0 items-center text-muted-foreground">
                        <BellOff size={13} aria-hidden />
                        <span className="sr-only">{t('sidebar.muted')}</span>
                    </span>
                )}
                {notifyMode === 'mention' && (
                    <span className="flex shrink-0 items-center text-muted-foreground">
                        <AtSign size={13} aria-hidden />
                        <span className="sr-only">{t('sidebar.mentionsOnly')}</span>
                    </span>
                )}
                {hasDraft && (
                    <span className="flex shrink-0 items-center text-muted-foreground">
                        <Pencil size={14} aria-hidden />
                        <span className="sr-only">{t('sidebar.draft')}</span>
                    </span>
                )}
                {calledMe && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-unread px-1 text-tiny font-semibold text-badge-unread-foreground">
                        <span aria-hidden>@</span>
                        <span className="sr-only">{t('sidebar.mentionedMe')}</span>
                    </span>
                )}
                {indicator === 'dot' && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-badge-unread">
                        <span className="sr-only">{t('sidebar.unread')}</span>
                    </span>
                )}
                {indicator === 'count' && (
                    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-badge-unread px-1 text-tiny font-semibold tabular-nums text-badge-unread-foreground">
                        <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
                        <span className="sr-only">{t('sidebar.unreadCount', { count: unread })}</span>
                    </span>
                )}
                {isFavorite && indicator === 'none' && (
                    <Star size={16} aria-hidden className="shrink-0 fill-favorite text-favorite" />
                )}
            </button>
        </Hint>
    );
});

const PendingPersonRow = () => (
    <div aria-hidden className="flex h-9 items-center gap-2 p-2">
        <Skeleton className="h-6 w-6 shrink-0 rounded-full bg-muted animate-pulse" />
        <Skeleton className="h-3 w-24 bg-muted animate-pulse" />
    </div>
);

const CHANNEL_GLYPH = <Hash size={16} aria-hidden />;

const Divider = () => <div aria-hidden className="h-px w-full shrink-0 bg-hairline" />;

const personAvatar = (seed: string, display: { name: string; thumbnail?: string }): ReactNode => (
    <Avatar className="h-6 w-6 shrink-0">
        {display.thumbnail && <AvatarImage src={display.thumbnail} alt={display.name} />}
        <AvatarFallback className="text-nano font-semibold" style={avatarStyle(seed || display.name)}>
            {display.name.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
    </Avatar>
);

const MemberRow = ({
    peerId,
    label,
    icon,
    starting,
    blocked,
    onStart,
}: {
    peerId: string;
    label: string;
    icon: ReactNode;
    starting: boolean;
    blocked: boolean;
    onStart: (peerId: string) => void;
}) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            onClick={() => !blocked && onStart(peerId)}
            aria-label={t('sidebar.startDm', { name: label })}
            aria-busy={starting || undefined}
            aria-disabled={blocked || undefined}
            data-channel-row={`member:${peerId}`}
            className={cn(
                'focus-ring flex h-9 w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left transition-colors duration-150 ease-tactile',
                blocked ? 'cursor-default opacity-60' : 'hover:bg-accent'
            )}
        >
            <span className="flex shrink-0 items-center text-foreground">{icon}</span>
            <span className="min-w-0 flex-1 truncate text-callout text-sidebar-foreground">{label}</span>
            {starting && (
                <span
                    role="status"
                    aria-label={t('sidebar.startingDm')}
                    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none"
                />
            )}
        </button>
    );
};

const SectionAddButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <Hint label={label}>
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="focus-ring tactile hit-target flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors ease-tactile hover:bg-accent"
        >
            <Plus size={16} aria-hidden />
        </button>
    </Hint>
);

export const ChannelList = ({
    channels,
    isLoading,
    selectedChannelId,
    query,
    onSelect,
    onJumpToMessage,
    elsewhereChannels,
    onSelectElsewhere,
    isDefaultMode,
    onCreateChannel,
    onCreateDm,
    memberPeers,
    onStartDm,
    startingPeerId,
}: ChannelListProps) => {
    const { t } = useTranslation();
    const myUid = runtime.session.useSessionIdentity().userId;
    const isDmCollapsed = useSidebarSectionsStore(s => !!s.collapsed.dm);
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const pinScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { pinnedIds, reorder: reorderPinned, toggle: togglePinned } = usePinnedChannels(pinScope);
    const { storedIds: storedChannelOrder, set: setStoredChannelOrder } = useChannelOrder(pinScope);
    const displayOrderRef = useRef<string[]>([]);
    useEffect(() => {
        useSidebarOrderStore.getState().setIds(displayOrderRef.current);
    });
    const activeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedChannelId]);
    const refocusAfterMoveRef = useRef<HTMLElement | null>(null);
    useLayoutEffect(() => {
        const el = refocusAfterMoveRef.current;
        if (!el) return;
        refocusAfterMoveRef.current = null;
        const focusDropped = !document.activeElement || document.activeElement === document.body;
        if (focusDropped && el.isConnected) el.focus();
    });

    const [menuTargetId, setMenuTargetId] = useState<string | null>(null);
    const clearIfOpen = useSelectedChannelStore(s => s.clearIfOpen);
    const menuActions = useChannelActions(menuTargetId, {
        onRemoved: () => {
            clearIfOpen(menuTargetId);
        },
    });

    const { regular, dms } = useMemo(() => {
        const split = { regular: [] as DomainChannel[], dms: [] as DomainChannel[] };
        for (const channel of channels) {
            (isDmBucket(channel) ? split.dms : split.regular).push(channel);
        }
        return split;
    }, [channels]);

    const canStartDm = !!onStartDm;
    const members = useMemo(() => (canStartDm ? (memberPeers ?? []) : []), [canStartDm, memberPeers]);
    const { identityOf, memberDisplay, holdSection: holdDmSection } = useDmIdentities(dms, members, pinScope ?? '');

    const dmIdentity = (channel: DomainChannel): { label: string; icon: ReactNode; pending: boolean } => {
        const { label, seed, display, pending } = identityOf(channel);
        return { label, icon: personAvatar(seed, display), pending };
    };

    const matchesQuery = (channel: DomainChannel, label: string): boolean => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return label.toLowerCase().includes(q) || (channel.name ?? channel.id ?? '').toLowerCase().includes(q);
    };

    const dialogs = (
        <>
            <QuickSwitcher
                channels={channels}
                onSelect={onSelect}
                elsewhere={elsewhereChannels}
                onSelectElsewhere={onSelectElsewhere}
            />
            <SearchDialog
                channels={channels}
                onSelect={onSelect}
                onJumpToMessage={onJumpToMessage}
                currentChannelId={selectedChannelId}
            />
        </>
    );

    if (isLoading) {
        return (
            <>
                <ChannelSkeleton />
                {dialogs}
            </>
        );
    }

    const dmRows = dms
        .map(channel => ({ channel, identity: dmIdentity(channel) }))
        .sort((a, b) => a.identity.label.localeCompare(b.identity.label));
    const dmById = new Map(dmRows.map(dm => [dm.channel.id ?? '', dm]));
    const chById = new Map(regular.map(c => [c.id ?? '', c]));
    const orderedChannelIds = applyChannelOrder(
        regular.filter(c => matchesQuery(c, bareChannelName(c.name) || (c.id ?? ''))).map(c => c.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    );
    const orderedDmIds = applyChannelOrder(
        dmRows.filter(dm => matchesQuery(dm.channel, dm.identity.label)).map(dm => dm.channel.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    );
    const visibleRegular = orderedChannelIds.flatMap(id => {
        const c = chById.get(id);
        return c ? [c] : [];
    });
    const visibleDms = orderedDmIds
        .flatMap(id => {
            const dm = dmById.get(id);
            return dm ? [dm] : [];
        })
        .sort((a, b) => Number(isSelfChannel(b.channel)) - Number(isSelfChannel(a.channel)));

    const q = query.trim().toLowerCase();
    const memberRows = members
        .flatMap(({ peerId }) => {
            const display = memberDisplay(peerId);
            if (!display.name || display.name === peerId) return [];
            return !q || display.name.toLowerCase().includes(q) ? [{ peerId, display }] : [];
        })
        .sort((a, b) => a.display.name.localeCompare(b.display.name));

    const isFiltering = query.trim().length > 0;
    if (isFiltering && visibleRegular.length + visibleDms.length + memberRows.length === 0) {
        return (
            <>
                {dialogs}
                <div className="px-4 py-8 text-center text-callout text-muted-foreground">{t('sidebar.noMatches')}</div>
            </>
        );
    }

    const showDmSection = visibleDms.length > 0 || memberRows.length > 0 || !isFiltering;
    const showChannelSection = visibleRegular.length > 0 || !isFiltering;
    const showHomeDmPointer = isDefaultMode && visibleDms.length === 0 && !isFiltering && !isDmCollapsed;

    const selfIds = new Set(dms.filter(isSelfChannel).map(c => c.id ?? ''));
    const onReorderFavorites = (keys: string[]) => {
        reorderPinned(keys.map(key => key.replace(/^fav:/, '')));
    };
    const makeSectionReorder = (section: 'ch' | 'dm') => (keys: string[]) => {
        const orderedIds = keys
            .filter(key => !key.startsWith('member:'))
            .map(key => key.replace(/^(ch|dm):/, ''))
            .filter(id => !selfIds.has(id));
        const dmIds = new Set(dms.map(c => c.id ?? ''));
        const chIds = new Set(regular.map(c => c.id ?? ''));
        if (section === 'ch') {
            setStoredChannelOrder([...orderedIds, ...storedChannelOrder.filter(id => dmIds.has(id))]);
        } else {
            setStoredChannelOrder([...storedChannelOrder.filter(id => chIds.has(id)), ...orderedIds]);
        }
    };
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
            if (collapsed.dm || selfIds.has(id)) return;
            const ids = visibleDms.map(dm => dm.channel.id ?? '').filter(dmId => !selfIds.has(dmId));
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
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const chord = sidebarMoveChord(e);
        if (chord !== null) {
            e.preventDefault();
            if (isFiltering) return;
            if (document.activeElement instanceof HTMLElement) refocusAfterMoveRef.current = document.activeElement;
            moveSelectedByKeyboard(chord);
            return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-channel-row]'));
        if (rows.length === 0) return;
        const focused = document.activeElement;
        const from = rows.findIndex(el => el === focused);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const start = from >= 0 ? from : rows.findIndex(el => el.dataset.channelRow === selectedChannelId);
        const nextIdx = start < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, start + delta));
        rows[nextIdx]?.focus();
    };

    const row = (
        channel: DomainChannel,
        label: string,
        icon: ReactNode,
        section: string,
        isFavorite?: boolean,
        pending?: boolean
    ): SectionItem => {
        const id = channel.id ?? '';
        const isActive = id === selectedChannelId;
        if (pending) {
            return {
                key: `${section}:${id}`,
                keepWhenCollapsed: false,
                dragDisabled: true,
                node: <PendingPersonRow />,
            };
        }
        return {
            key: `${section}:${id}`,
            keepWhenCollapsed: isActive || (channel.unreadCount ?? 0) > 0,
            dragDisabled: section === 'dm' && isSelfChannel(channel),
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
                        rowRef={isActive && !isFavorite ? activeRef : undefined}
                    />
                </ChannelRowMenu>
            ),
        };
    };

    const favoriteById = new Map<
        string,
        { channel: DomainChannel; label: string; icon: ReactNode; pending?: boolean }
    >();
    for (const c of visibleRegular) {
        favoriteById.set(c.id ?? '', {
            channel: c,
            label: bareChannelName(c.name) || (c.id ?? ''),
            icon: CHANNEL_GLYPH,
        });
    }
    for (const dm of dmRows) favoriteById.set(dm.channel.id ?? '', { channel: dm.channel, ...dm.identity });
    const favoriteRows = pinnedIds.flatMap(id => {
        const fav = favoriteById.get(id);
        return fav ? [fav] : [];
    });
    const allChannelIds = applyChannelOrder(
        regular.map(c => c.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    );
    const allDmIds = applyChannelOrder(
        dmRows.map(dm => dm.channel.id ?? ''),
        pinScope ? storedChannelOrder : undefined
    ).sort((a, b) => Number(selfIds.has(b)) - Number(selfIds.has(a)));
    displayOrderRef.current = [...new Set([...pinnedIds, ...allChannelIds, ...allDmIds])].filter(Boolean);

    const dmSectionItems: SectionItem[] = holdDmSection
        ? [
              {
                  key: 'dm-pending',
                  keepWhenCollapsed: false,
                  dragDisabled: true,
                  node: (
                      <div role="status" aria-label={t('chat.loadingChannels')}>
                          {Array.from({ length: Math.min(Math.max(visibleDms.length, 1), 6) }).map((_, i) => (
                              <PendingPersonRow key={i} />
                          ))}
                      </div>
                  ),
              },
          ]
        : [
              ...visibleDms.map(dm =>
                  row(dm.channel, dm.identity.label, dm.identity.icon, 'dm', false, dm.identity.pending)
              ),
              ...memberRows.map(({ peerId, display }) => ({
                  key: `member:${peerId}`,
                  keepWhenCollapsed: false,
                  dragDisabled: true,
                  node: (
                      <MemberRow
                          peerId={peerId}
                          label={display.name}
                          icon={personAvatar(peerId, display)}
                          starting={startingPeerId === peerId}
                          blocked={!!startingPeerId}
                          onStart={peerId => onStartDm?.(peerId)}
                      />
                  ),
              })),
          ];

    return (
        <nav aria-label={t('sidebar.channels')} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-4 pb-6 pt-3">
            {dialogs}
            <Divider />
            {(favoriteRows.length > 0 || !isFiltering) && (
                <>
                    <SortableSection
                        id="fav"
                        title={t('sidebar.favorites')}
                        emptyLabel={t('sidebar.empty.favorites')}
                        items={favoriteRows.map(fav => row(fav.channel, fav.label, fav.icon, 'fav', true, fav.pending))}
                        dragDisabled={isFiltering}
                        onReorder={onReorderFavorites}
                    />
                    <Divider />
                </>
            )}
            {showChannelSection && (
                <>
                    <SortableSection
                        id="ch"
                        title={t('sidebar.channels')}
                        emptyLabel={t('sidebar.empty.channels')}
                        items={visibleRegular.map(channel =>
                            row(channel, bareChannelName(channel.name) || (channel.id ?? ''), CHANNEL_GLYPH, 'ch')
                        )}
                        dragDisabled={isFiltering}
                        onReorder={makeSectionReorder('ch')}
                        action={
                            !isDefaultMode &&
                            onCreateChannel && (
                                <SectionAddButton label={t('rail.addChannel')} onClick={onCreateChannel} />
                            )
                        }
                    />
                    {showDmSection && <Divider />}
                </>
            )}
            {showDmSection && (
                <SortableSection
                    id="dm"
                    title={t('sidebar.dms')}
                    emptyLabel={isDefaultMode ? undefined : t('sidebar.empty.dms')}
                    items={dmSectionItems}
                    dragDisabled={isFiltering || holdDmSection}
                    onReorder={makeSectionReorder('dm')}
                    action={onCreateDm && <SectionAddButton label={t('dm.new.open')} onClick={onCreateDm} />}
                />
            )}
            {showDmSection && showHomeDmPointer && (
                <MobileAppPointer messageKey="mobileApp.homeDm" className="px-2 pb-2" />
            )}
            <ChannelActionDialogs
                channelId={menuTargetId ?? ''}
                channelName={channels.find(c => (c.id ?? '') === menuTargetId)?.name ?? ''}
                kickName=""
                actions={menuActions}
            />
        </nav>
    );
};
