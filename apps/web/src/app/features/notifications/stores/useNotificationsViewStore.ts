import { create } from 'zustand';

import type { NotificationTab } from '../../../utils/notifications';

interface NotificationsViewState {
    tab: NotificationTab;
    unreadOnly: boolean;
    setTab: (tab: NotificationTab) => void;
    setUnreadOnly: (unreadOnly: boolean) => void;
    /** Back to "all" with the filter off — what an entry that is not a return starts from. */
    reset: () => void;
}

/**
 * Which tab the notifications screen shows and whether "unread only" is on. Held in memory, outside
 * the page, because the page unmounts when an item opens its message: coming back has to land on
 * the tab and filter that were left, or the restored scroll offset would be applied to a different
 * list. Only a return keeps them: the page calls `reset` on any other entry, and a relaunch starts on
 * "all" with the filter off again — this is how the inbox is being read right now, not a preference.
 */
export const useNotificationsViewStore = create<NotificationsViewState>(set => ({
    tab: 'all',
    unreadOnly: false,
    setTab: tab => set({ tab }),
    setUnreadOnly: unreadOnly => set({ unreadOnly }),
    reset: () => set({ tab: 'all', unreadOnly: false }),
}));
