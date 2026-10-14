import { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AtSign, ChevronRight, Hash, X } from 'lucide-react';

import type { DomainChannel, DomainPlace } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import {
    Hint,
    avatarStyle,
    hoverReveal,
    unreadMentionCount,
    ResizablePanel,
    useMentionsPanelStore,
    useMentionsStore,
    type MentionItem,
    formatListTime,
    PANE_HEADER,
    PANEL_TITLE,
} from '../../../shared';

const formatMentionAt = formatListTime;

/** channelId → name, so 200 rows never scan the channel list each. */
export const indexChannelNames = (channels: { id?: string; name?: string }[]): Map<string, string> => {
    const names = new Map<string, string>();
    for (const channel of channels) {
        if (channel.id && channel.name) names.set(channel.id, channel.name);
    }
    return names;
};

interface MentionRowProps {
    item: MentionItem;
    /** Resolved channel name (current place only); chip is hidden when absent. */
    channelName?: string;
    /** Who and where the removal drops, already composed ("Ada · #general"). */
    removeTarget: string;
    /** The row last opened from this pane: the message the reader went to. */
    isCurrent?: boolean;
    onOpen: (id: string) => void;
    onRemove: (id: string) => void;
    openRef: (element: HTMLButtonElement | null) => void;
}

// Memo: the pane re-renders on every unread change, and 200 rows re-render
// with it. Props are primitives plus store-stable callbacks (see below), so an
// untouched row skips the render.
const MentionRow = memo(
    ({ item, channelName, removeTarget, isCurrent, onOpen, onRemove, openRef }: MentionRowProps) => {
        const { t } = useTranslation();
        return (
    <li
        className={cn(
            'group/mention relative flex rounded-md border shadow-raised transition-colors ease-tactile hover:bg-accent/60',
            isCurrent ? 'border-primary-ink/40 bg-selected' : 'border-hairline bg-elevated'
        )}
    >
        <button
            ref={openRef}
            type="button"
            aria-current={isCurrent || undefined}
            onClick={() => onOpen(item.id)}
            className="focus-ring flex min-w-0 flex-1 items-start gap-2.5 rounded-md p-2.5 text-left"
        >
            {/* Unread marker — a dot in the left gutter until the mention is opened. */}
            <span aria-hidden className="mt-3 w-1.5 shrink-0">
                {!item.readAt && <span className="block h-1.5 w-1.5 rounded-full bg-status-dot" />}
            </span>
            <Avatar className="mt-0.5 h-9 w-9 shrink-0">
                {item.avatar && <AvatarImage src={item.avatar} alt={item.ownerName} />}
                <AvatarFallback
                    className="text-callout font-semibold"
                    style={avatarStyle(item.colorSeed ?? item.ownerName)}
                >
                    {item.ownerName.charAt(0).toUpperCase() || '?'}
                </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 pr-7 text-caption text-muted-foreground">
                    <span className={cn('truncate text-foreground', !item.readAt ? 'font-semibold' : 'font-medium')}>
                        {item.ownerName}
                    </span>
                    {channelName && (
                        <>
                            <Hash size={10} aria-hidden className="shrink-0" />
                            <span className="truncate">{channelName}</span>
                        </>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums">{formatMentionAt(item.createdAt)}</span>
                </span>
                <span className="line-clamp-2 whitespace-pre-wrap break-words pr-5 text-callout text-muted-foreground">
                    {item.content}
                </span>
            </span>
        </button>
        {/* Jump affordance — surfaces on row hover. */}
        <ChevronRight
            size={16}
            aria-hidden
            className={cn(
                'pointer-events-none absolute bottom-2 right-2 text-muted-foreground',
                hoverReveal('mention')
            )}
        />
        <Hint label={t('activity.remove')}>
            <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={t('activity.removeLabel', { target: removeTarget })}
                className={cn(
                    'focus-ring tactile absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
                    hoverReveal('mention')
                )}
            >
                <X size={13} />
            </button>
        </Hint>
    </li>
        );
    }
);

interface MentionsPanelProps {
    /** Loaded channels (active place) — names the mention rows' channel chips. */
    channels: DomainChannel[];
    /** Places in the active cloud — names the place-group headers. */
    places: DomainPlace[];
    /** The active place — its group sorts to the top. */
    currentPlaceId?: string;
    /** Jump to the mentioned message: select its place + channel, then scroll to it
     *  (or open the thread panel when it's a reply — 4th arg = root chatNo string). */
    onSelect: (channelId: string, chatNo?: number, placeId?: string, threadRootId?: string) => void;
}

/**
 * Trailing pane listing device-local @me mentions ("Activity"), grouped by place
 * (active place first), newest first within each group. Opening a row jumps to
 * its message and marks it read; the X drops it from the inbox.
 */
export const MentionsPanel = ({ channels, places, currentPlaceId, onSelect }: MentionsPanelProps) => {
    const { t } = useTranslation();
    const close = useMentionsPanelStore(s => s.close);
    const openedId = useMentionsPanelStore(s => s.openedId);
    const items = useMentionsStore(s => s.items);

    const channelNames = useMemo(() => indexChannelNames(channels), [channels]);
    const channelName = (channelId: string): string | undefined => channelNames.get(channelId);
    const placeName = (placeId: string): string => places.find(p => p.id === placeId)?.name ?? t('activity.otherPlace');

    // Group newest-first items by place; the active place sorts to the top, the
    // rest keep recency order. Items captured before placeId existed fall under
    // the catch-all "Other workspace" group (key '').
    const groups = useMemo(() => {
        const sorted = Object.values(items).sort((a, b) => b.createdAt - a.createdAt);
        const byPlace = new Map<string, MentionItem[]>();
        for (const item of sorted) {
            const key = item.placeId ?? '';
            const list = byPlace.get(key);
            if (list) list.push(item);
            else byPlace.set(key, [item]);
        }
        // Map keeps first-seen (recency) order; float the active place to the top.
        const keys = [...byPlace.keys()].sort((a, b) => (a === currentPlaceId ? -1 : b === currentPlaceId ? 1 : 0));
        return keys.map(key => ({ key, items: byPlace.get(key) ?? [] }));
    }, [items, currentPlaceId]);

    const hasUnread = unreadMentionCount(items) > 0;

    // Stable row callbacks: the host's onSelect is a fresh closure every render
    // (HomePage keeps a ref for the same reason), so rows read it through one
    // here. Unchanged rows keep every prop and skip the render.
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const openItem = useCallback((id: string) => {
        const item = useMentionsStore.getState().items[id];
        if (!item) return;
        useMentionsPanelStore.getState().markOpened(id);
        useMentionsStore.getState().markRead(id);
        onSelectRef.current(item.channelId, item.chatNo, item.placeId, item.parentId);
    }, []);
    // Removing a row strands focus on <body>; hand it to the row that takes its
    // place, or the one above when it was last. The visual order is recorded
    // each render because recency order is not the display order.
    const orderRef = useRef<string[]>([]);
    orderRef.current = groups.flatMap(group => group.items.map(item => item.id));
    const focusTarget = useRef<string | null>(null);
    const rowRefs = useRef(new Map<string, (element: HTMLButtonElement | null) => void>());
    const openRef = useCallback((id: string) => {
        let ref = rowRefs.current.get(id);
        if (!ref) {
            ref = element => {
                if (element && focusTarget.current === id) {
                    focusTarget.current = null;
                    element.focus();
                }
            };
            rowRefs.current.set(id, ref);
        }
        return ref;
    }, []);
    const removeItem = useCallback((id: string) => {
        const order = orderRef.current;
        const at = order.indexOf(id);
        focusTarget.current = order[at + 1] ?? order[at - 1] ?? null;
        rowRefs.current.delete(id);
        useMentionsStore.getState().remove(id);
    }, []);
    const markAllRead = useMentionsStore(s => s.markAllRead);
    const removeTarget = (item: MentionItem): string => {
        const channel = channelName(item.channelId);
        return channel ? `${item.ownerName} · #${channel}` : item.ownerName;
    };

    return (
        <ResizablePanel
            storageKey={'chatic.mentionsPanel.width'}
            resizeLabel={t('activity.resize')}
            label={t('activity.title')}
            onClose={close}
            className="bg-background"
        >
            <header className={`${PANE_HEADER} px-4`}>
                <h2 className={PANEL_TITLE}>{t('activity.title')}</h2>
                <div className="flex shrink-0 items-center gap-1">
                    {hasUnread && (
                        <button
                            type="button"
                            onClick={markAllRead}
                            className="focus-ring tactile rounded-md px-2 py-1 text-caption text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                        >
                            {t('activity.markAllRead')}
                        </button>
                    )}
                    <Hint label={t('activity.close')}>
                        <button
                            type="button"
                            onClick={close}
                            aria-label={t('activity.close')}
                            className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                        >
                            <X size={18} />
                        </button>
                    </Hint>
                </div>
            </header>
            {groups.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-well text-muted-foreground">
                        <AtSign size={22} />
                    </div>
                    <p className="text-heading text-foreground">{t('activity.empty')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('activity.emptyHint')}</p>
                    <p className="max-w-xs text-caption text-muted-foreground">{t('activity.deviceLocal')}</p>
                </div>
            ) : (
                <div className="scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                    <p className="px-2 text-caption text-muted-foreground">{t('activity.deviceLocal')}</p>
                    {groups.map(group => {
                        const unread = group.items.filter(item => !item.readAt).length;
                        return (
                            <div key={group.key || 'none'} className="flex flex-col gap-1">
                                <h3 className="sticky top-0 z-raised flex items-center gap-2 bg-background px-2 py-1 text-overline uppercase text-muted-foreground">
                                    <span className="truncate">{placeName(group.key)}</span>
                                    {unread > 0 && <span className="shrink-0 tabular-nums">{unread}</span>}
                                </h3>
                                <ul className="flex flex-col gap-1">
                                    {group.items.map(item => (
                                        <MentionRow
                                            key={item.id}
                                            item={item}
                                            channelName={channelName(item.channelId)}
                                            removeTarget={removeTarget(item)}
                                            isCurrent={item.id === openedId}
                                            onOpen={openItem}
                                            onRemove={removeItem}
                                            openRef={openRef(item.id)}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </ResizablePanel>
    );
};
