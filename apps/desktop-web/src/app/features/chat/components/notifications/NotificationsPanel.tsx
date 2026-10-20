import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AtSign, Bell, Check, CheckCheck, ChevronDown, ListChecks, ListFilter, type LucideIcon } from 'lucide-react';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@chatic/ui-kit/components/ui/tabs';
import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    INBOX_SORTS,
    INBOX_TABS,
    bareChannelName,
    formatDayHeading,
    myThreadKey,
    useMentionsStore,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type InboxSort,
    type InboxTab,
    type MentionItem,
} from '../../../../shared';
import { ConfirmDialog } from '../../../channels';
import { FILTER_CHIP, filterChipTone } from '../filterChip';
import { NotificationSnoozeButton } from '../NotificationSnoozeButton';
import { NotificationCard, SOURCE_ICON } from './NotificationCard';
import { SelectionBar } from './SelectionBar';
import { dayOf, inboxTabCounts, inboxView, isInTab } from './inboxView';

/**
 * How long an item opened under the unread filter stays in the list, marked as the one opened,
 * before the filter takes it: long enough to see where the click went, short enough that the list
 * is the unread list again by the time the reader looks back.
 */
export const OPENED_LINGER_MS = 3000;

const DAY = 86_400_000;

/** Each tab but All leads with the icon its cards' source chip carries; Mentions with the `@`. */
const TAB_ICON: Partial<Record<InboxTab, LucideIcon>> = { ...SOURCE_ICON, mention: AtSign };

interface NotificationsPanelProps {
    /** The active cloud: names the threads a reply answers, and whether its thread scan is still running. */
    cloudId: string;
    /** Loaded channels (active place) — name the cards' channels before the name kept with the item. */
    channels: DomainChannel[];
    /** The place `channels` belong to: channel ids repeat across places, so only its items use them. */
    currentPlaceId?: string;
    /** Jump to the message: select its place and channel, then scroll to it or open its thread (4th arg). */
    onSelect: (channelId: string, chatNo?: number, placeId?: string, threadRootId?: string) => void;
}

/**
 * The Notifications destination's sidebar column: the device-local inbox in tabs (where it
 * happened, or Mentions for why), an unread filter and a sort order, in date groups.
 *
 * Opening an item jumps to its message and marks it read. Under the unread filter that would drop
 * the card from under the pointer, so the opened one stays for `OPENED_LINGER_MS`, marked, then
 * leaves; changing the tab or the filter lets it go at once.
 *
 * In selection mode a click selects instead. The selection is of the cards listed, so changing the
 * tab or the filter drops it; marking the whole tab read is undone from its toast.
 */
export const NotificationsPanel = ({ cloudId, channels, currentPlaceId, onSelect }: NotificationsPanelProps) => {
    const { t } = useTranslation();
    const itemsById = useMentionsStore(s => s.items);
    const threads = useMyThreadsStore(s => s.threads);
    const { openedId, tab, unreadOnly, sort, markOpened, setTab, setUnreadOnly, setSort } =
        useNotificationsPanelStore();
    const isScanning = useNotificationsPanelStore(s => s.scanningCid === cloudId);

    const [keepId, setKeepId] = useState<string | null>(null);
    const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const release = useCallback(() => {
        if (lingerRef.current) clearTimeout(lingerRef.current);
        lingerRef.current = null;
        setKeepId(null);
    }, []);
    useEffect(
        () => () => {
            if (lingerRef.current) clearTimeout(lingerRef.current);
        },
        []
    );

    const items = useMemo(() => Object.values(itemsById), [itemsById]);
    const counts = useMemo(() => inboxTabCounts(items), [items]);
    const groups = useMemo(
        () => inboxView(items, { tab, unreadOnly, sort, keepId }),
        [items, tab, unreadOnly, sort, keepId]
    );
    const channelNames = useMemo(
        () => new Map(channels.map(channel => [channel.id ?? '', bareChannelName(channel.name)])),
        [channels]
    );
    const isHere = (item: MentionItem): boolean => !item.placeId || item.placeId === currentPlaceId;
    const isEmpty = items.length === 0;
    const today = dayOf(Date.now());

    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    // Deleting the last item ends the mode: there is nothing left to select.
    const isSelecting = selecting && !isEmpty;
    // Ended for good, not paused: the next item captured opens rather than toggles.
    useEffect(() => {
        if (isEmpty) setSelecting(false);
    }, [isEmpty]);
    // The bar unmounts on the way out, so focus goes back to the button that opened it, or to the
    // title when deleting the last item disabled that button.
    const selectButtonRef = useRef<HTMLButtonElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const wasSelecting = useRef(false);
    useEffect(() => {
        if (wasSelecting.current && !isSelecting) (isEmpty ? titleRef : selectButtonRef).current?.focus();
        wasSelecting.current = isSelecting;
    }, [isSelecting, isEmpty]);
    const listed = useMemo(() => groups.flatMap(group => group.items), [groups]);
    const chosen = useMemo(() => listed.filter(item => selected.has(item.id)).map(item => item.id), [listed, selected]);
    const allState = chosen.length === 0 ? false : chosen.length === listed.length ? true : 'mixed';
    const tabUnreadIds = useMemo(
        () => items.filter(item => !item.readAt && isInTab(item, tab)).map(item => item.id),
        [items, tab]
    );
    const toggle = useCallback(
        (id: string) =>
            setSelected(prev => {
                const next = new Set(prev);
                if (!next.delete(id)) next.add(id);
                return next;
            }),
        []
    );
    const clearSelection = () => setSelected(new Set());
    const markAllRead = () => {
        const changed = useMentionsStore.getState().markManyRead(tabUnreadIds);
        setSelecting(false);
        clearSelection();
        toast({
            description: t('inbox.allRead', { count: changed.length }),
            action: (
                <ToastAction altText={t('inbox.undo')} onClick={() => useMentionsStore.getState().markUnread(changed)}>
                    {t('inbox.undo')}
                </ToastAction>
            ),
        });
    };

    // Stable for the memo'd cards: the host's onSelect is a fresh closure each render.
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const openItem = useCallback(
        (id: string) => {
            const { items: current } = useMentionsStore.getState();
            const item = current[id];
            if (!item) return;
            const { unreadOnly: filtering } = useNotificationsPanelStore.getState();
            if (filtering && !item.readAt) {
                if (lingerRef.current) clearTimeout(lingerRef.current);
                setKeepId(id);
                lingerRef.current = setTimeout(() => {
                    lingerRef.current = null;
                    setKeepId(null);
                }, OPENED_LINGER_MS);
            }
            markOpened(id);
            useMentionsStore.getState().markRead(id);
            onSelectRef.current(item.channelId, item.chatNo, item.placeId, item.parentId);
        },
        [markOpened]
    );

    const dayLabel = (day: number): string =>
        day === today ? t('chat.today') : day === today - DAY ? t('chat.yesterday') : formatDayHeading(day);
    const rootPreviewOf = (item: MentionItem): string | undefined =>
        item.parentId ? threads[myThreadKey(cloudId, item.channelId, item.parentId)]?.rootPreview : undefined;

    return (
        <section aria-label={t('inbox.title')} className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-[4.25rem] shrink-0 items-center justify-between gap-2 px-4">
                {isSelecting ? (
                    <SelectionBar
                        count={chosen.length}
                        allState={allState}
                        onToggleAll={() =>
                            setSelected(allState === true ? new Set() : new Set(listed.map(item => item.id)))
                        }
                        onSelectUnread={() =>
                            setSelected(new Set(listed.filter(item => !item.readAt).map(item => item.id)))
                        }
                        onClear={clearSelection}
                        onMarkAllRead={tabUnreadIds.length > 0 ? markAllRead : undefined}
                        onMarkRead={() => {
                            useMentionsStore.getState().markManyRead(chosen);
                            clearSelection();
                        }}
                        onDelete={() => setConfirmingDelete(true)}
                        onClose={() => {
                            setSelecting(false);
                            clearSelection();
                        }}
                    />
                ) : (
                    <>
                        <h2
                            ref={titleRef}
                            tabIndex={-1}
                            className="truncate text-headline font-bold text-sidebar-foreground"
                        >
                            {t('inbox.title')}
                        </h2>
                        <span className="flex shrink-0 items-center gap-0.5">
                            <button
                                ref={selectButtonRef}
                                type="button"
                                aria-label={t('inbox.select.start')}
                                disabled={isEmpty}
                                onClick={() => {
                                    release();
                                    setSelecting(true);
                                }}
                                className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                            >
                                <ListChecks size={18} aria-hidden />
                            </button>
                            <NotificationSnoozeButton variant="icon" />
                        </span>
                    </>
                )}
            </header>
            <ConfirmDialog
                open={confirmingDelete}
                onOpenChange={setConfirmingDelete}
                title={t('inbox.select.deleteTitle', { count: chosen.length })}
                description={t('inbox.select.deleteHint')}
                confirmLabel={t('inbox.select.delete')}
                onConfirm={() => {
                    useMentionsStore.getState().removeMany(chosen);
                    clearSelection();
                    setConfirmingDelete(false);
                }}
            />
            <Tabs
                value={tab}
                onValueChange={value => {
                    release();
                    clearSelection();
                    setTab(value as InboxTab);
                }}
            >
                <TabsList className="flex h-auto w-full justify-start gap-0 rounded-none border-b border-hairline bg-transparent px-2.5 py-0">
                    {INBOX_TABS.map(key => {
                        const TabIcon = TAB_ICON[key];
                        return (
                            <TabsTrigger
                                key={key}
                                value={key}
                                className="relative -mb-px flex h-10 items-center gap-1 rounded-none border-b-2 border-transparent px-2 text-caption font-medium text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                {TabIcon && <TabIcon size={13} aria-hidden />}
                                {t(`inbox.tab.${key}`)}
                                {counts[key] > 0 && (
                                    <>
                                        <span
                                            aria-hidden
                                            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-badge-unread px-1 text-nano font-semibold tabular-nums text-badge-unread-foreground"
                                        >
                                            {counts[key]}
                                        </span>
                                        <span className="sr-only">{t('inbox.tabUnread', { count: counts[key] })}</span>
                                    </>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>
            <div className="flex shrink-0 items-center gap-2 px-4 py-3">
                <button
                    type="button"
                    aria-pressed={unreadOnly}
                    disabled={isEmpty}
                    onClick={() => {
                        release();
                        clearSelection();
                        setUnreadOnly(!unreadOnly);
                    }}
                    className={cn(FILTER_CHIP, filterChipTone(unreadOnly))}
                >
                    <CheckCheck size={14} aria-hidden />
                    {t('inbox.unreadOnly')}
                </button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={isEmpty}>
                        <button
                            type="button"
                            className={cn(
                                FILTER_CHIP,
                                'border-hairline text-foreground hover:bg-accent data-[state=open]:border-foreground'
                            )}
                        >
                            <ListFilter size={14} aria-hidden />
                            {t('inbox.sortBy', { order: t(`inbox.sort.${sort}`) })}
                            <ChevronDown size={12} aria-hidden className="text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 shadow-overlay">
                        <DropdownMenuLabel className="text-micro font-medium text-muted-foreground">
                            {t('inbox.sortTitle')}
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={sort} onValueChange={value => setSort(value as InboxSort)}>
                            {INBOX_SORTS.map(key => (
                                <DropdownMenuRadioItem
                                    key={key}
                                    value={key}
                                    // The kit's leading dot gives way to the trailing check the design uses.
                                    className="cursor-pointer gap-2 py-2 pl-2 data-[state=checked]:bg-accent data-[state=checked]:font-semibold [&>span:first-child]:hidden"
                                >
                                    {t(`inbox.sort.${key}`)}
                                    {key === sort && <Check size={14} aria-hidden className="ml-auto" />}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {groups.length === 0 ? (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
                >
                    <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                        <Bell size={32} aria-hidden />
                    </span>
                    {isScanning && tab === 'thread' ? (
                        <p className="text-callout text-muted-foreground">{t('inbox.scanning')}</p>
                    ) : (
                        <>
                            <p className="text-heading text-foreground">{t('inbox.empty')}</p>
                            <p className="max-w-xs text-caption text-muted-foreground">{t('inbox.emptyHint')}</p>
                        </>
                    )}
                    {/* Said here too: an empty inbox on a second device is not a lost history. */}
                    <p className="max-w-xs text-caption text-muted-foreground">{t('inbox.deviceLocal')}</p>
                </div>
            ) : (
                <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
                    {groups.map(group => (
                        <section
                            key={group.day}
                            aria-labelledby={`inbox-day-${group.day}`}
                            className="flex flex-col gap-1.5"
                        >
                            <h3
                                id={`inbox-day-${group.day}`}
                                className="flex items-center gap-2 py-2 text-micro font-medium text-muted-foreground"
                            >
                                <span className="shrink-0">{dayLabel(group.day)}</span>
                                <span aria-hidden className="h-px flex-1 bg-hairline" />
                            </h3>
                            <ul className="flex flex-col gap-1.5">
                                {group.items.map(item => (
                                    <NotificationCard
                                        key={item.id}
                                        item={item}
                                        channelName={(isHere(item) && channelNames.get(item.channelId)) || item.channelName}
                                        rootPreview={rootPreviewOf(item)}
                                        isCurrent={item.id === openedId}
                                        selected={isSelecting ? selected.has(item.id) : undefined}
                                        onOpen={isSelecting ? toggle : openItem}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </section>
    );
};
