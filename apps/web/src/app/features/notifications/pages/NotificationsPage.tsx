import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigationType } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';

import {
    AlertDialog,
    FilterChip,
    IconEmptyState,
    IconNavBell,
    SegmentedTabs,
    SelectionActionBar,
} from '@chatic/web-ui-kit';

import { haptics } from '../../../bridge/haptics';
import { takeScroll, toCloudId, useScopedNotifications, useScrollChrome, useScrollRestoration } from '../../../hooks';
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
import { pickedIn, useNotificationActions, useNotificationAvatars, useNotificationSelection, withHeld } from '../hooks';
import { useNotificationsViewStore } from '../stores/useNotificationsViewStore';
import { countedActionLabel, formatDayHeading } from '../utils/rowParts';

export const NotificationsPage = () => {
    const { t, i18n } = useTranslation();
    const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US';
    const items = useScopedNotifications();
    const tab = useNotificationsViewStore(state => state.tab);
    const setTab = useNotificationsViewStore(state => state.setTab);
    const unreadOnly = useNotificationsViewStore(state => state.unreadOnly);
    const setUnreadOnly = useNotificationsViewStore(state => state.setUnreadOnly);
    const resetView = useNotificationsViewStore(state => state.reset);
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const scrollKey = `notifications:${toCloudId(selectedCloudId)}:${selectedSiteId ?? ''}`;

    const navigationType = useNavigationType();
    const enteredFresh = useRef(navigationType !== 'POP');
    useLayoutEffect(() => {
        if (!enteredFresh.current) return;
        resetView();
        takeScroll(scrollKey);
    }, []);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const actions = useNotificationActions();

    const counts = useMemo(() => unreadCounts(items), [items]);
    const inTab = useMemo(() => newestFirst(byTab(items, tab)), [items, tab]);
    const selection = useNotificationSelection();
    const visible = useMemo(
        () => withHeld(filterUnreadOnly(inTab, unreadOnly), inTab, selection.held),
        [inTab, unreadOnly, selection.held]
    );
    const now = Date.now();
    const groups = groupByDay(visible, now);
    const picked = pickedIn(visible, selection.selected);
    const avatarOf = useNotificationAvatars(visible);
    const {
        containerRef: scrollContainerRef,
        onScroll: handleListScroll,
        consumePendingRestore,
    } = useScrollRestoration(scrollKey, visible.length > 0);
    const { scrolled, track: trackScroll } = useScrollChrome();
    const changeUnreadOnly = (on: boolean) => {
        consumePendingRestore();
        setUnreadOnly(on);
    };
    const setNavSuppressed = useBottomNavSuppression(state => state.setSuppressed);
    useEffect(() => {
        setNavSuppressed(selection.active);
        return () => setNavSuppressed(false);
    }, [selection.active, setNavSuppressed]);

    const hasAnything = items.length > 0;
    const tabUnread = inTab.some(item => !item.read);
    const tabLabel = (id: NotificationTab) => t(`notifications.inbox.tabs.${id}`);
    const countedLabel = (key: string, count: number) => countedActionLabel(t, key, count);

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

    const markPickedRead = () => {
        selection.hold(picked.unreadIds);
        actions.markRead(picked.unreadIds);
    };

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
                            {t('notifications.inbox.selectedCount', { count: picked.ids.length })}
                        </h1>
                    </div>
                ) : (
                    <div
                        key="browsing"
                        className="flex w-full items-center justify-between duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                    >
                        <h1
                            data-compact={scrolled}
                            className={cn(
                                'font-bold leading-[25px] tracking-[-0.5px] text-brand-ink transition-[font-size] duration-200 ease-out motion-reduce:transition-none dark:text-foreground',
                                scrolled ? 'text-[20px]' : 'text-[28px]'
                            )}
                        >
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

            <div
                ref={scrollContainerRef}
                onScroll={event => {
                    handleListScroll();
                    trackScroll(event.currentTarget);
                }}
                className="min-h-0 flex-1 overflow-y-auto"
            >
                {hasAnything &&
                    (selection.active ? (
                        <div
                            key="quick"
                            className="flex gap-1.5 px-4 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                        >
                            <FilterChip
                                label={t('notifications.inbox.selectAll')}
                                selected={picked.all}
                                onClick={() => {
                                    tick();
                                    selection.toggleAll(visible.map(item => item.id));
                                }}
                            />
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
                                    avatarUrl={avatarOf(item)}
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
                        label: countedLabel('notifications.inbox.markRead', picked.unreadIds.length),
                        disabled: picked.unreadIds.length === 0,
                        onClick: markPickedRead,
                    }}
                    destructive={{
                        label: countedLabel('notifications.inbox.delete', picked.ids.length),
                        disabled: picked.ids.length === 0,
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
                title={t('notifications.inbox.deleteConfirm.title', { count: picked.ids.length })}
                description={t('notifications.inbox.deleteConfirm.description')}
                cancelLabel={t('notifications.inbox.cancel')}
                confirmLabel={t('notifications.inbox.deleteConfirm.confirm')}
                destructive
                onConfirm={() => {
                    setConfirmDelete(false);
                    actions.remove(picked.ids);
                    selection.exit();
                }}
            />
        </div>
    );
};
