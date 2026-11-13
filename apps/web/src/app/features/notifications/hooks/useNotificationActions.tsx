import { useTranslation } from 'react-i18next';

import { ToastAction } from '@chatic/ui-kit/components/ui/toast';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import type { NotificationItem } from '../../../utils/notifications';
import { notificationTarget } from '../utils/rowParts';

/** How long the undo toast stays. */
export const NOTIFICATION_UNDO_MS = 3000;

/**
 * What a notification list does with its items: open one (it reads, then goes to the message), mark
 * some read, delete some — the last two with a 3-second toast that can undo exactly what changed.
 * Deleting takes items off the inbox only; the messages stay in their rooms.
 */
export const useNotificationActions = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();

    const open = (item: NotificationItem) => {
        useNotificationStore.getState().markRead([item.id]);
        navigate(notificationTarget(item, { room: ROUTES.channels.room, thread: ROUTES.channels.thread }));
    };

    const undoAction = (onUndo: () => void) => (
        <ToastAction altText={t('notifications.inbox.undo')} onClick={onUndo}>
            {t('notifications.inbox.undo')}
        </ToastAction>
    );

    const markRead = (ids: readonly string[]) => {
        const changed = useNotificationStore.getState().markRead(ids);
        if (changed.length === 0) return;
        toast({
            title: t('notifications.inbox.markedRead', { count: changed.length }),
            duration: NOTIFICATION_UNDO_MS,
            action: undoAction(() => useNotificationStore.getState().markUnread(changed)),
        });
    };

    const remove = (ids: readonly string[]) => {
        const removed = useNotificationStore.getState().remove(ids);
        if (removed.length === 0) return;
        toast({
            title: t('notifications.inbox.deleted', { count: removed.length }),
            duration: NOTIFICATION_UNDO_MS,
            action: undoAction(() => useNotificationStore.getState().restore(removed)),
        });
    };

    return { open, markRead, remove };
};
