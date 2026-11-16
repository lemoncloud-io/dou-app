import type { NotificationItem } from './notificationModel';

/**
 * The rules of the stored inbox, as pure functions over its id → item map. The store only feeds
 * these. Every function hands back the map it was given when nothing changes, so the store can skip
 * the write — `persist` rewrites device storage on every `set`, changed or not.
 */
export type NotificationItems = Record<string, NotificationItem>;

/** The most items kept. No retention period: the cap is the only bound. */
export const NOTIFICATIONS_MAX = 500;

/**
 * Trims the map to the cap. Read items go first, oldest first: they have done their job. Only when
 * every item left is unread does the oldest unread one go, so the cap holds whatever the reader does.
 */
const evict = (items: NotificationItems): NotificationItems => {
    const ids = Object.keys(items);
    if (ids.length <= NOTIFICATIONS_MAX) return items;
    const order = ids.sort((a, b) => {
        const left = items[a];
        const right = items[b];
        if (left.read !== right.read) return left.read ? -1 : 1;
        return left.createdAt - right.createdAt;
    });
    const next = { ...items };
    for (const id of order.slice(0, ids.length - NOTIFICATIONS_MAX)) delete next[id];
    return next;
};

/**
 * Adds an item, unless one with its id is already held: a message is captured once, and a resync or
 * a duplicate event must not bring a removed-then-restored or read item back as new.
 */
export const addItem = (items: NotificationItems, item: NotificationItem): NotificationItems => {
    if (items[item.id]) return items;
    return evict({ ...items, [item.id]: item });
};

/** The ids among `ids` that are held and unread — what a mark changes, and what an undo restores. */
export const unreadIdsOf = (items: NotificationItems, ids: readonly string[]): string[] =>
    ids.filter(id => items[id] && !items[id].read);

const setRead = (items: NotificationItems, ids: readonly string[], read: boolean): NotificationItems => {
    const changed = ids.filter(id => items[id] && items[id].read !== read);
    if (changed.length === 0) return items;
    const next = { ...items };
    for (const id of changed) next[id] = { ...items[id], read };
    return next;
};

export const markItemsRead = (items: NotificationItems, ids: readonly string[]): NotificationItems =>
    setRead(items, ids, true);

/** The undo of a mark: those of `ids` still held go back to unread. */
export const markItemsUnread = (items: NotificationItems, ids: readonly string[]): NotificationItems =>
    setRead(items, ids, false);

export const removeItems = (items: NotificationItems, ids: readonly string[]): NotificationItems => {
    const present = ids.filter(id => items[id]);
    if (present.length === 0) return items;
    const next = { ...items };
    for (const id of present) delete next[id];
    return next;
};

/**
 * The undo of a remove: the items come back as they were. An id held again meanwhile keeps what is
 * held — it is the newer state of the same message.
 */
export const restoreItems = (items: NotificationItems, restored: readonly NotificationItem[]): NotificationItems => {
    const missing = restored.filter(item => !items[item.id]);
    if (missing.length === 0) return items;
    const next = { ...items };
    for (const item of missing) next[item.id] = item;
    return evict(next);
};

/**
 * Marks read every unread item of a room up to `chatNo`, the room's read cursor: reading in the room
 * — here, or on another device through the synced cursor — clears the inbox without opening each
 * item.
 *
 * Items that live in a thread are left alone. The room's cursor moves when the room is read, and a
 * thread is read on its own screen; see {@link markThreadItemsRead}.
 */
export const markChannelItemsReadUpTo = (
    items: NotificationItems,
    cloudId: string,
    channelId: string,
    chatNo: number
): NotificationItems => {
    if (!channelId || !chatNo) return items;
    const ids = Object.values(items)
        .filter(
            item =>
                !item.read &&
                !item.parentId &&
                item.cloudId === cloudId &&
                item.channelId === channelId &&
                (item.chatNo ?? 0) <= chatNo
        )
        .map(item => item.id);
    return markItemsRead(items, ids);
};

/** Marks read every unread item in one thread — the thread's screen was opened. */
export const markThreadItemsRead = (
    items: NotificationItems,
    cloudId: string,
    channelId: string,
    rootNo: string
): NotificationItems => {
    const ids = Object.values(items)
        .filter(
            item => !item.read && item.cloudId === cloudId && item.channelId === channelId && item.parentId === rootNo
        )
        .map(item => item.id);
    return markItemsRead(items, ids);
};
