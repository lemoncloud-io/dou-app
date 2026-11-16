import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigationType } from 'react-router-dom';

import { runtime } from '@chatic/app-runtime';

import {
    AlertDialog,
    FilterChip,
    IconEmptyState,
    IconNavBell,
    SegmentedTabs,
    SelectionActionBar,
} from '@chatic/web-ui-kit';

import { haptics } from '../../../bridge/haptics';
import { takeScroll, toCloudId, useScopedNotifications, useScrollRestoration } from '../../../hooks';
import { useBottomNavSuppression } from '../../../stores/useBottomNavSuppression';
import { BottomNavSpacer } from '../../../ui/components';
import {
    NOTIFICATION_TABS,
    byTab,
    groupByDay,
    newestFirst,
    unreadCounts,
    unreadOnly as filterUnreadOnly,
    type NotificationItem,
    type NotificationTab,
} from '../../../utils/notifications';
import { NotificationListItem } from '../components/NotificationListItem';
import { QUICK_SELECTIONS, useNotificationActions, useNotificationSelection } from '../hooks';
import { useNotificationsViewStore } from '../stores/useNotificationsViewStore';
import { formatDayHeading } from '../utils/rowParts';

/**
 * "내 알림" — the notifications tab (Figma 6021:18427). Everything that called or answered the reader
 * where the session is, read or not: five tabs with their unread counts, an "unread only" filter,
 * "mark all read" for the tab, the items by day, newest first. A tap opens the message; a long press
 * or "Select" enters selection mode, where the bottom bar marks read or deletes (with undo).
 */
export const NotificationsPage = () => {
    const { t, i18n } = useTranslation();
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    const items = useScopedNotifications();
    // Tab and filter outlive the page so a return from an opened item lands on the same list; the
    // scroll offset below is only meaningful against that list.
    const tab = useNotificationsViewStore(state => state.tab);
    const setTab = useNotificationsViewStore(state => state.setTab);
    const unreadOnly = useNotificationsViewStore(state => state.unreadOnly);
    const setUnreadOnly = useNotificationsViewStore(state => state.setUnreadOnly);
    const resetView = useNotificationsViewStore(state => state.reset);
    // The offset belongs to one place's list: another place or cloud lists other items, and landing
    // its reader mid-way down at a position they never scrolled to is no better than the top.
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const scrollKey = `notifications:${toCloudId(selectedCloudId)}:${selectedSiteId ?? ''}`;

    // Only a return (a back press, POP) lands where the reader left. Any other way in — the bottom
    // nav's bell, whose dot means something new arrived, and new items sort to the top — is a fresh
    // look at the inbox: "all", the filter off, the top. Settled before the restore below claims the
    // offset (layout effects run in order) and before paint, so the old tab never shows.
    const navigationType = useNavigationType();
    const enteredFresh = useRef(navigationType !== 'POP');
    useLayoutEffect(() => {
        if (!enteredFresh.current) return;
        resetView();
        takeScroll(scrollKey);
        // Once, at entry: a later change of scope while the page is open is not a new entry.
    }, []);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const actions = useNotificationActions();

    const counts = useMemo(() => unreadCounts(items), [items]);
    const inTab = useMemo(() => newestFirst(byTab(items, tab)), [items, tab]);
    const visible = useMemo(() => filterUnreadOnly(inTab, unreadOnly), [inTab, unreadOnly]);
    const now = Date.now();
    const groups = groupByDay(visible, now);
    const selection = useNotificationSelection(visible);
    // Opening an item navigates away and unmounts this page, so without this a back press lands at
    // the top. Ready once rows are drawn: an offset applied to an empty list clamps to 0 and is lost.
    const {
        containerRef: scrollContainerRef,
        onScroll: handleListScroll,
        consumePendingRestore,
    } = useScrollRestoration(scrollKey, visible.length > 0);
    // Changing the filter changes the list under a claim still waiting for rows (say, the return
    // landed on "nothing unread"): the old offset means nothing against the new list, so drop it.
    const changeUnreadOnly = (on: boolean) => {
        consumePendingRestore();
        setUnreadOnly(on);
    };
    // The action bar takes the bottom nav's place while selecting, as the design swaps them.
    const setNavSuppressed = useBottomNavSuppression(state => state.setSuppressed);
    useEffect(() => {
        setNavSuppressed(selection.active);
        return () => setNavSuppressed(false);
    }, [selection.active, setNavSuppressed]);

    const hasAnything = items.length > 0;
    const tabUnread = inTab.some(item => !item.read);
    const tabLabel = (id: NotificationTab) => t(`notifications.inbox.tabs.${id}`);

    // Haptics: a tick for every toggle and switch, a firmer tap as a long press commits to selection
    // mode, a warning as the delete confirm opens; the actions play their own success.
    const tick = () => haptics.play('selection');
    const onPress = (item: NotificationItem) => {
        if (!selection.active) return actions.open(item);
        tick();
        selection.toggle(item.id);
    };
    const onLongPress = (item: NotificationItem) => {
        if (selection.active) {
            tick();
            selection.toggle(item.id);
            return;
        }
        haptics.play('impact');
        selection.enter(item.id);
    };

    const selectedIds = selection.selectedItems.map(item => item.id);
    const finish = (run: () => void) => {
        run();
        selection.exit();
    };

    // The design's empty block: a bell in a grey disc, centred (Figma 6033:21159 · 6033:21419).
    const bell = <IconNavBell size={28} />;
    const empty = !hasAnything ? (
        <IconEmptyState
            icon={bell}
            title={t('notifications.inbox.empty.none')}
            description={t('notifications.inbox.empty.noneHint')}
        />
    ) : inTab.length === 0 ? (
        <IconEmptyState
            icon={bell}
            title={t('notifications.inbox.empty.tab', { tab: tabLabel(tab) })}
            description={t(`notifications.inbox.empty.tabHint.${tab}`)}
        />
    ) : visible.length === 0 ? (
        <IconEmptyState
            icon={bell}
            title={t('notifications.inbox.empty.unread')}
            actionLabel={t('notifications.inbox.empty.showAll')}
            onAction={() => changeUnreadOnly(false)}
        />
    ) : null;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <header className="flex min-h-[calc(var(--safe-top,0px)+4rem)] shrink-0 items-center px-4 pb-2 pt-[calc(var(--safe-top,0px)+0.5rem)]">
                {selection.active ? (
                    <div
                        key="selecting"
                        className="relative flex w-full items-center justify-center duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                    >
                        <button
                            type="button"
                            onClick={() => {
                                tick();
                                selection.exit();
                            }}
                            className="absolute left-0 text-[15px] font-semibold text-description"
                        >
                            {t('notifications.inbox.cancel')}
                        </button>
                        <h1 className="text-[17px] font-bold text-foreground">
                            {t('notifications.inbox.selectedCount', { count: selectedIds.length })}
                        </h1>
                    </div>
                ) : (
                    <div
                        key="browsing"
                        className="flex w-full items-center justify-between duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                    >
                        <h1 className="text-[28px] font-bold leading-[25px] tracking-[-0.5px] text-brand-ink dark:text-foreground">
                            {t('notifications.inbox.title')}
                        </h1>
                        {hasAnything && (
                            <button
                                type="button"
                                onClick={() => {
                                    tick();
                                    selection.enter();
                                }}
                                className="text-[15px] font-semibold text-description"
                            >
                                {t('notifications.inbox.select')}
                            </button>
                        )}
                    </div>
                )}
            </header>

            <SegmentedTabs
                variant="inline"
                items={NOTIFICATION_TABS.map(id => ({ id, label: tabLabel(id), count: counts[id] }))}
                value={tab}
                onChange={id => {
                    tick();
                    setTab(id as NotificationTab);
                }}
            />

            <div ref={scrollContainerRef} onScroll={handleListScroll} className="min-h-0 flex-1 overflow-y-auto">
                {hasAnything &&
                    (selection.active ? (
                        <div
                            key="quick"
                            className="flex gap-1.5 px-4 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                        >
                            {QUICK_SELECTIONS.map(quick => (
                                <FilterChip
                                    key={quick}
                                    label={t(`notifications.inbox.quick.${quick}`)}
                                    selected={selection.pressedQuick === quick}
                                    onClick={() => {
                                        tick();
                                        selection.quickSelect(quick);
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <div
                            key="filter"
                            className="flex items-center justify-between px-4 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                        >
                            <FilterChip
                                check
                                label={t('notifications.inbox.unreadOnly')}
                                selected={unreadOnly}
                                onClick={() => {
                                    tick();
                                    changeUnreadOnly(!unreadOnly);
                                }}
                            />
                            <button
                                type="button"
                                disabled={!tabUnread}
                                onClick={() => actions.markRead(inTab.filter(item => !item.read).map(item => item.id))}
                                className="text-[13px] font-semibold text-tab-idle disabled:opacity-40"
                            >
                                {t('notifications.inbox.markAllRead')}
                            </button>
                        </div>
                    ))}

                {empty ??
                    groups.map(group => (
                        <section
                            key={group.dayStart}
                            className="duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                        >
                            <h2 className="px-4 pb-1.5 pt-3.5 text-[12px] leading-[14px] text-description">
                                {formatDayHeading(group.day, group.dayStart, t, locale)}
                            </h2>
                            {group.items.map(item => (
                                <NotificationListItem
                                    key={item.id}
                                    item={item}
                                    now={now}
                                    selectable={selection.active}
                                    selected={selection.selected.has(item.id)}
                                    onPress={onPress}
                                    onLongPress={onLongPress}
                                />
                            ))}
                        </section>
                    ))}
                <BottomNavSpacer />
            </div>

            {selection.active && (
                <SelectionActionBar
                    secondary={{
                        label: t('notifications.inbox.markRead', { count: selectedIds.length }),
                        disabled: !selection.selectedItems.some(item => !item.read),
                        onClick: () => finish(() => actions.markRead(selectedIds)),
                    }}
                    destructive={{
                        label: t('notifications.inbox.delete', { count: selectedIds.length }),
                        disabled: selectedIds.length === 0,
                        onClick: () => {
                            haptics.play('warning');
                            setConfirmDelete(true);
                        },
                    }}
                />
            )}

            <AlertDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('notifications.inbox.deleteConfirm.title', { count: selectedIds.length })}
                description={t('notifications.inbox.deleteConfirm.description')}
                cancelLabel={t('notifications.inbox.cancel')}
                confirmLabel={t('notifications.inbox.deleteConfirm.confirm')}
                destructive
                onConfirm={() => {
                    setConfirmDelete(false);
                    finish(() => actions.remove(selectedIds));
                }}
            />
        </div>
    );
};
