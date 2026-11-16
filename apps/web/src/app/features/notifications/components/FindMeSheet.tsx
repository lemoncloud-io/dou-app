import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, FilterChip } from '@chatic/web-ui-kit';

import { haptics } from '../../../bridge/haptics';
import { useScopedNotifications } from '../../../hooks';
import { MENTION_KINDS, findMe, type NotificationItem } from '../../../utils/notifications';
import { useNotificationActions } from '../hooks';
import { NotificationListItem } from './NotificationListItem';

const FIND_ME_FILTERS = ['all', 'mention', 'thread'] as const;
type FindMeFilter = (typeof FIND_ME_FILTERS)[number];

const inFilter = (item: NotificationItem, filter: FindMeFilter): boolean =>
    filter === 'all' ? true : filter === 'mention' ? MENTION_KINDS.has(item.kind) : !MENTION_KINDS.has(item.kind);

export interface FindMeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * "나를 찾는 메시지" — what is looking for the reader right now (Figma 6027:21566): the unread mentions
 * of them and replies to their messages where the session is, newest first. Reactions, new 1:1
 * messages and threads they only joined stay in the notifications tab. Reading an item — here or in
 * its room — takes it off this list; it stays in the tab.
 */
export const FindMeSheet = ({ open, onOpenChange }: FindMeSheetProps) => {
    const { t } = useTranslation();
    const items = useScopedNotifications();
    const actions = useNotificationActions();
    const [filter, setFilter] = useState<FindMeFilter>('all');

    const all = useMemo(() => findMe(items), [items]);
    const visible = useMemo(() => all.filter(item => inFilter(item, filter)), [all, filter]);
    const count = (id: FindMeFilter) => all.filter(item => inFilter(item, id)).length;
    const now = Date.now();

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange} title={t('notifications.findMe.title')}>
            <div className="flex items-center justify-between gap-2 px-4 py-2">
                <div className="flex gap-1.5">
                    {FIND_ME_FILTERS.map(id => (
                        <FilterChip
                            key={id}
                            label={t(`notifications.findMe.filters.${id}`)}
                            count={count(id)}
                            selected={filter === id}
                            onClick={() => {
                                if (filter !== id) haptics.play('selection');
                                setFilter(id);
                            }}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    disabled={visible.length === 0}
                    onClick={() => actions.markRead(visible.map(item => item.id))}
                    className="shrink-0 text-[13px] font-semibold text-tab-idle disabled:opacity-40"
                >
                    {t('notifications.inbox.markAllRead')}
                </button>
            </div>
            <div className="flex flex-col">
                {visible.map(item => (
                    <NotificationListItem
                        key={item.id}
                        item={item}
                        now={now}
                        onPress={pressed => {
                            onOpenChange(false);
                            actions.open(pressed);
                        }}
                    />
                ))}
            </div>
            {visible.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {t('notifications.findMe.empty')}
                </p>
            )}
            <p className="whitespace-pre-line px-4 pb-6 pt-4 text-center text-[12px] leading-[1.5] text-description">
                {t('notifications.findMe.footnote')}
            </p>
        </BottomSheet>
    );
};
