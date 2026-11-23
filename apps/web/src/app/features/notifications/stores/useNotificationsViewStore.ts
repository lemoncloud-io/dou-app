import { create } from 'zustand';

import type { NotificationTab } from '../../../utils/notifications';

interface NotificationsViewState {
    tab: NotificationTab;
    unreadOnly: boolean;
    setTab: (tab: NotificationTab) => void;
    setUnreadOnly: (unreadOnly: boolean) => void;
    reset: () => void;
}

export const useNotificationsViewStore = create<NotificationsViewState>(set => ({
    tab: 'all',
    unreadOnly: false,
    setTab: tab => set({ tab }),
    setUnreadOnly: unreadOnly => set({ unreadOnly }),
    reset: () => set({ tab: 'all', unreadOnly: false }),
}));
