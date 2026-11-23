import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertDialog, BottomSheet, FilterChip, SelectionActionBar } from '@chatic/web-ui-kit';

import { haptics } from '../../../bridge/haptics';
import { useScopedNotifications } from '../../../hooks';
import { MENTION_KINDS, THREAD_KINDS, findMe, type NotificationItem } from '../../../utils/notifications';
import { pickedIn, useNotificationActions, useNotificationAvatars, useNotificationSelection, withHeld } from '../hooks';
import { countedActionLabel } from '../utils/rowParts';
import { NotificationListItem } from './NotificationListItem';

const FIND_ME_FILTERS = ['all', 'mention', 'thread'] as const;
type FindMeFilter = (typeof FIND_ME_FILTERS)[number];
const NO_ITEMS: NotificationItem[] = [];
const noop = () => undefined;

const inFilter = (item: NotificationItem, filter: FindMeFilter): boolean =>
    filter === 'all' ? true : filter === 'mention' ? MENTION_KINDS.has(item.kind) : THREAD_KINDS.has(item.kind);

export interface FindMeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const FindMeSheet = ({ open, onOpenChange }: FindMeSheetProps) => {
    const { t } = useTranslation();
    const items = useScopedNotifications();
    const actions = useNotificationActions();
    const [filter, setFilter] = useState<FindMeFilter>('all');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const selection = useNotificationSelection();
    const { active, exit } = selection;

    const all = useMemo(() => findMe(items), [items]);
    const listed = useMemo(() => withHeld(all, items, selection.held), [all, items, selection.held]);
    const visible = useMemo(() => listed.filter(item => inFilter(item, filter)), [listed, filter]);
    const avatarOf = useNotificationAvatars(open ? visible : NO_ITEMS);
    const count = (id: FindMeFilter) => all.filter(item => inFilter(item, id)).length;
    const picked = pickedIn(visible, selection.selected);
    const now = Date.now();

    useEffect(() => {
        if (!open && active) exit();
    }, [open, active, exit]);

    const tick = () => haptics.play('selection');
    const onPress = (item: NotificationItem) => {
        if (!selection.active) {
            onOpenChange(false);
            actions.open(item);
            return;
        }
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

    return (
        <>
            <BottomSheet
                open={open}
                onOpenChange={onOpenChange}
                className="h-[calc(90vh-var(--keyboard-height,0px))]"
                title={
                    selection.active
                        ? t('notifications.inbox.selectedCount', { count: picked.ids.length })
                        : t('notifications.findMe.title')
                }
                onClose={noop}
                closeLabel={t('notifications.findMe.close')}
                footer={
                    selection.active ? (
                        <SelectionActionBar
                            placement="inline"
                            secondary={{
                                label: countedActionLabel(t, 'notifications.inbox.markRead', picked.unreadIds.length),
                                disabled: picked.unreadIds.length === 0,
                                onClick: markPickedRead,
                            }}
                            destructive={{
                                label: countedActionLabel(t, 'notifications.inbox.delete', picked.ids.length),
                                disabled: picked.ids.length === 0,
                                onClick: () => {
                                    haptics.play('warning');
                                    setConfirmDelete(true);
                                },
                            }}
                        />
                    ) : undefined
                }
            >
                {selection.active ? (
                    <div
                        key="selecting"
                        className="flex px-4 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
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
                        key="browsing"
                        className="flex items-center justify-between gap-2 px-4 py-2 duration-200 animate-in fade-in-0 motion-reduce:animate-none"
                    >
                        <div className="flex gap-1.5">
                            {FIND_ME_FILTERS.map(id => (
                                <FilterChip
                                    key={id}
                                    label={t(`notifications.findMe.filters.${id}`)}
                                    count={count(id)}
                                    selected={filter === id}
                                    onClick={() => {
                                        if (filter !== id) tick();
                                        setFilter(id);
                                    }}
                                />
                            ))}
                        </div>
                        {visible.length > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    tick();
                                    selection.enter();
                                }}
                                className="shrink-0 text-[15px] font-semibold text-description"
                            >
                                {t('notifications.inbox.select')}
                            </button>
                        )}
                    </div>
                )}
                <div className="flex flex-col">
                    {visible.map(item => (
                        <NotificationListItem
                            key={item.id}
                            item={item}
                            avatarUrl={avatarOf(item)}
                            now={now}
                            selectable={selection.active}
                            selected={selection.selected.has(item.id)}
                            onPress={onPress}
                            onLongPress={onLongPress}
                        />
                    ))}
                </div>
                {visible.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {t('notifications.findMe.empty')}
                    </p>
                )}
                {!selection.active && (
                    <p className="whitespace-pre-line px-4 pb-6 pt-4 text-center text-[12px] leading-[1.5] text-description">
                        {t('notifications.findMe.footnote')}
                    </p>
                )}
            </BottomSheet>

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
        </>
    );
};
