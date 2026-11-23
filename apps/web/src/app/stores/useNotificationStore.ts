import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { deviceStore, persistStorageOver } from '../storage';
import type { NotificationItem } from '../utils/notifications/notificationModel';
import {
    NOTIFICATION_RETENTION_MS,
    applyOverlay,
    freshOverlay,
    markReadIn,
    markThreadReadIn,
    markUnreadIn,
    pruneOverlay,
    removeIn,
    restoreIn,
    type NotificationItems,
    type NotificationOverlay,
} from '../utils/notifications/notificationOverlay';

export const NOTIFICATION_OVERLAY_STORAGE_KEY = 'dou.notifications.state.v1';

export const RETIRED_NOTIFICATION_STORAGE_KEYS = ['dou.notifications.v1', 'dou.notifications.threads.v1'] as const;

interface NotificationState {
    computed: NotificationItems;
    overlay: NotificationOverlay;
    items: NotificationItems;
    computedRooms: Record<string, true>;
    setRoomItems: (cloudId: string, channelId: string, items: readonly NotificationItem[]) => void;
    retainRooms: (cloudId: string, channelIds: ReadonlySet<string>) => void;
    markRead: (ids: readonly string[]) => string[];
    markUnread: (ids: readonly string[]) => void;
    remove: (ids: readonly string[]) => NotificationItem[];
    restore: (items: readonly NotificationItem[]) => void;
    markThreadRead: (cloudId: string, channelId: string, rootNo: string) => void;
    clear: () => void;
}

export const notificationRoomKey = (cloudId: string, channelId: string): string => `${cloudId}:${channelId}`;

const windowStart = (): number => Date.now() - NOTIFICATION_RETENTION_MS;

const sameRoom = (item: NotificationItem, cloudId: string, channelId: string): boolean =>
    item.cloudId === cloudId && item.channelId === channelId;

const sameItem = (a: NotificationItem, b: NotificationItem): boolean => {
    const keys = Object.keys(a) as Array<keyof NotificationItem>;
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => {
            const commitOverlay = (next: NotificationOverlay): void => {
                const pruned = pruneOverlay(next, windowStart());
                if (pruned === get().overlay) return;
                set({ overlay: pruned, items: applyOverlay(get().computed, pruned, windowStart()) });
            };
            const commitComputed = (computed: NotificationItems): void => {
                if (computed === get().computed) return;
                set({ computed, items: applyOverlay(computed, get().overlay, windowStart()) });
            };
            return {
                computed: {},
                overlay: freshOverlay(Date.now()),
                items: {},
                computedRooms: {},
                setRoomItems: (cloudId, channelId, roomItems) => {
                    const roomKey = notificationRoomKey(cloudId, channelId);
                    if (!get().computedRooms[roomKey]) {
                        set({ computedRooms: { ...get().computedRooms, [roomKey]: true } });
                    }
                    const { computed } = get();
                    const held = Object.values(computed).filter(item => sameRoom(item, cloudId, channelId));
                    const unchanged =
                        held.length === roomItems.length &&
                        roomItems.every(item => {
                            const prev = computed[item.id];
                            return !!prev && sameRoom(prev, cloudId, channelId) && sameItem(prev, item);
                        });
                    if (unchanged) return;
                    const next: NotificationItems = {};
                    for (const item of Object.values(computed)) {
                        if (!sameRoom(item, cloudId, channelId)) next[item.id] = item;
                    }
                    for (const item of roomItems) next[item.id] = item;
                    commitComputed(next);
                },
                retainRooms: (cloudId, channelIds) => {
                    const { computed, computedRooms } = get();
                    const wanted = new Set([...channelIds].map(id => notificationRoomKey(cloudId, id)));
                    const keptRooms = Object.keys(computedRooms).filter(key => wanted.has(key));
                    if (keptRooms.length !== Object.keys(computedRooms).length) {
                        set({ computedRooms: Object.fromEntries(keptRooms.map(key => [key, true as const])) });
                    }
                    const kept = Object.values(computed).filter(
                        item => item.cloudId === cloudId && channelIds.has(item.channelId)
                    );
                    if (kept.length === Object.keys(computed).length) return;
                    commitComputed(Object.fromEntries(kept.map(item => [item.id, item])));
                },
                markRead: ids => {
                    const { overlay, changed } = markReadIn(get().overlay, get().items, ids);
                    commitOverlay(overlay);
                    return changed;
                },
                markUnread: ids => commitOverlay(markUnreadIn(get().overlay, ids)),
                remove: ids => {
                    const { overlay, changed } = removeIn(get().overlay, get().items, ids);
                    commitOverlay(overlay);
                    return changed;
                },
                restore: removed => commitOverlay(restoreIn(get().overlay, removed)),
                markThreadRead: (cloudId, channelId, rootNo) =>
                    commitOverlay(markThreadReadIn(get().overlay, get().items, cloudId, channelId, rootNo)),
                clear: () => set({ computed: {}, overlay: freshOverlay(Date.now()), items: {}, computedRooms: {} }),
            };
        },
        {
            name: NOTIFICATION_OVERLAY_STORAGE_KEY,
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ overlay: state.overlay }),
            merge: (persisted, current) => {
                const stored = (persisted as Partial<NotificationState> | undefined)?.overlay;
                const overlay = pruneOverlay(
                    stored
                        ? {
                              entries: stored.entries ?? {},
                              threads: stored.threads ?? {},
                              baselineAt: stored.baselineAt ?? current.overlay.baselineAt,
                          }
                        : current.overlay,
                    windowStart()
                );
                return { ...current, overlay, items: applyOverlay(current.computed, overlay, windowStart()) };
            },
        }
    )
);

export const removeRetiredNotificationStorage = (): void => {
    for (const key of RETIRED_NOTIFICATION_STORAGE_KEYS) deviceStore.remove(key);
};

export const clearNotifications = (): void => {
    useNotificationStore.getState().clear();
};
