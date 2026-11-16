import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { deviceStore, persistStorageOver } from '../storage';
import {
    addItem,
    markChannelItemsReadUpTo,
    markItemsRead,
    markItemsUnread,
    markThreadItemsRead,
    removeItems,
    restoreItems,
    unreadIdsOf,
    type NotificationItems,
} from '../utils/notifications/notificationItems';
import type { NotificationItem } from '../utils/notifications/notificationModel';
import {
    rememberThread,
    type ThreadParticipation,
    type ThreadParticipations,
} from '../utils/notifications/threadParticipation';

/** The device storage key. One key for every cloud; each item names its own. */
export const NOTIFICATIONS_STORAGE_KEY = 'dou.notifications.v1';

/** The device storage key of the threads the reader takes part in. */
export const THREAD_PARTICIPATIONS_STORAGE_KEY = 'dou.notifications.threads.v1';

interface NotificationState {
    items: NotificationItems;
    /** Adds an item; an id already held is ignored, so a message is captured once. */
    add: (item: NotificationItem) => void;
    /** Marks those of `ids` that are unread as read, and returns them — what an undo hands back. */
    markRead: (ids: readonly string[]) => string[];
    /** Undo of `markRead`. */
    markUnread: (ids: readonly string[]) => void;
    /** Removes those of `ids` that are held, and returns them — what an undo hands back. */
    remove: (ids: readonly string[]) => NotificationItem[];
    /** Undo of `remove`. */
    restore: (items: readonly NotificationItem[]) => void;
    /** A room's read cursor moved to `chatNo`: its top-level items up to there are read. */
    markChannelReadUpTo: (cloudId: string, channelId: string, chatNo: number) => void;
    /** A thread's screen was opened: its items are read. */
    markThreadRead: (cloudId: string, channelId: string, rootNo: string) => void;
    clear: () => void;
}

/**
 * The device-local notification inbox. No server notification list exists, so this is what this
 * device captured, persisted to device storage; it does not follow the account to another device.
 * The rules live in `notificationItems`; every action writes only when they change something.
 */
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => {
            const apply = (next: NotificationItems): void => {
                if (next !== get().items) set({ items: next });
            };
            return {
                items: {},
                add: item => apply(addItem(get().items, item)),
                markRead: ids => {
                    const changed = unreadIdsOf(get().items, ids);
                    apply(markItemsRead(get().items, changed));
                    return changed;
                },
                markUnread: ids => apply(markItemsUnread(get().items, ids)),
                remove: ids => {
                    const { items } = get();
                    const removed = ids.map(id => items[id]).filter((item): item is NotificationItem => !!item);
                    apply(removeItems(items, ids));
                    return removed;
                },
                restore: restored => apply(restoreItems(get().items, restored)),
                markChannelReadUpTo: (cloudId, channelId, chatNo) =>
                    apply(markChannelItemsReadUpTo(get().items, cloudId, channelId, chatNo)),
                markThreadRead: (cloudId, channelId, rootNo) =>
                    apply(markThreadItemsRead(get().items, cloudId, channelId, rootNo)),
                clear: () => apply({}),
            };
        },
        {
            name: NOTIFICATIONS_STORAGE_KEY,
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ items: state.items }),
        }
    )
);

interface ThreadParticipationState {
    threads: ThreadParticipations;
    remember: (key: string, patch: Pick<ThreadParticipation, 'rootMine' | 'rootPreview'>, at: number) => void;
    clear: () => void;
}

/**
 * The threads this device has seen the reader take part in (see `threadParticipation`). It decides
 * between "a reply to mine" and "a thread I joined" without reading the root again, and remembers
 * a thread I replied in whose root is someone else's.
 */
export const useThreadParticipationStore = create<ThreadParticipationState>()(
    persist(
        (set, get) => ({
            threads: {},
            remember: (key, patch, at) => {
                const next = rememberThread(get().threads, key, patch, at);
                if (next !== get().threads) set({ threads: next });
            },
            clear: () => {
                if (Object.keys(get().threads).length > 0) set({ threads: {} });
            },
        }),
        {
            name: THREAD_PARTICIPATIONS_STORAGE_KEY,
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ threads: state.threads }),
        }
    )
);

/**
 * Empties the inbox and the thread record. They are the signed-in person's: registered as a sign-out
 * callback, so the next account on this device never opens onto them.
 */
export const clearNotifications = (): void => {
    useNotificationStore.getState().clear();
    useThreadParticipationStore.getState().clear();
};
