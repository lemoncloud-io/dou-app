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

/** The device storage key of the overlay. One key for every cloud; each entry's id names its cloud. */
export const NOTIFICATION_OVERLAY_STORAGE_KEY = 'dou.notifications.state.v1';

/**
 * Keys the inbox used while it stored snapshots of every item and a record of the threads the reader
 * took part in. Neither is read any more; they are removed once so they do not sit in device storage.
 */
export const RETIRED_NOTIFICATION_STORAGE_KEYS = ['dou.notifications.v1', 'dou.notifications.threads.v1'] as const;

interface NotificationState {
    /** The items worked out from the cached rows, read only by their rooms' cursors. Not persisted. */
    computed: NotificationItems;
    /** What the reader did that the rows cannot say. Persisted per device. */
    overlay: NotificationOverlay;
    /** `computed` with `overlay` applied — what every screen reads. */
    items: NotificationItems;
    /**
     * The rooms worked out at least once since launch, by `notificationRoomKey`. Before its first run a
     * room's items are not missing, only not known yet — a screen that takes a snapshot at entry waits.
     */
    computedRooms: Record<string, true>;
    /** Replaces one room's computed items. */
    setRoomItems: (cloudId: string, channelId: string, items: readonly NotificationItem[]) => void;
    /** Drops the computed items of every room that is not one of `channelIds` in `cloudId`. */
    retainRooms: (cloudId: string, channelIds: ReadonlySet<string>) => void;
    /** Marks those of `ids` that are unread as read, and returns them — what an undo hands back. */
    markRead: (ids: readonly string[]) => string[];
    /** Undo of `markRead`. */
    markUnread: (ids: readonly string[]) => void;
    /** Deletes those of `ids` that are shown, and returns them — what an undo hands back. */
    remove: (ids: readonly string[]) => NotificationItem[];
    /** Undo of `remove`. */
    restore: (items: readonly NotificationItem[]) => void;
    /** A thread's screen was opened: its items so far are read. */
    markThreadRead: (cloudId: string, channelId: string, rootNo: string) => void;
    clear: () => void;
}

/** The key of one room in `computedRooms`. Every cloud numbers its rooms from the same start. */
export const notificationRoomKey = (cloudId: string, channelId: string): string => `${cloudId}:${channelId}`;

/** The start of the window, now. */
const windowStart = (): number => Date.now() - NOTIFICATION_RETENTION_MS;

const sameRoom = (item: NotificationItem, cloudId: string, channelId: string): boolean =>
    item.cloudId === cloudId && item.channelId === channelId;

/** Field by field: an item's fields are all plain values, and a room is recomputed on every write to it. */
const sameItem = (a: NotificationItem, b: NotificationItem): boolean => {
    const keys = Object.keys(a) as Array<keyof NotificationItem>;
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};

/**
 * The notification inbox. There is no server notification list: the items are worked out on this
 * device from the rooms' cached rows (`useNotificationFeed`), and only what the reader did to them —
 * marked read by hand, deleted, a thread read on its screen — is kept, per device, as an overlay. The
 * rules live in `notificationOverlay`; every action writes only when they change something.
 */
export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => {
            /** Sets the overlay, pruned to the retention window, and the items it derives. */
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
                // Replaced by the stored overlay on hydration; kept, with its baseline, when none is stored.
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
                // The next account starts its own overlay: what was cached before it signed in is not news.
                clear: () => set({ computed: {}, overlay: freshOverlay(Date.now()), items: {}, computedRooms: {} }),
            };
        },
        {
            name: NOTIFICATION_OVERLAY_STORAGE_KEY,
            storage: persistStorageOver(deviceStore),
            partialize: state => ({ overlay: state.overlay }),
            // The overlay comes back from storage after the store was made: derive the items again,
            // and drop what has aged out while the app was closed. With nothing stored — the first
            // launch of this inbox on the device — the overlay the store started with stands, and so
            // does its baseline.
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

/** Removes the keys the snapshot inbox wrote. Safe to call on every launch. */
export const removeRetiredNotificationStorage = (): void => {
    for (const key of RETIRED_NOTIFICATION_STORAGE_KEYS) deviceStore.remove(key);
};

/**
 * Empties the inbox. Its overlay is the signed-in person's: registered as a sign-out callback, so the
 * next account on this device never opens onto it.
 */
export const clearNotifications = (): void => {
    useNotificationStore.getState().clear();
};
