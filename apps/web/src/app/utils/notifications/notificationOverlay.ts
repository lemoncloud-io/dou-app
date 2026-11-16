import { threadKey, threadRootNo, type NotificationItem } from './notificationModel';

/**
 * How far back the inbox reaches, by when a message was sent. It bounds the rows the inbox reads and
 * how long the overlay remembers what the reader did to an item.
 */
export const NOTIFICATION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** Items by id. */
export type NotificationItems = Record<string, NotificationItem>;

/**
 * What the reader did to one item that the rules cannot work out from the rows: marked it read by
 * hand, or deleted it. `at` is the item's sent time, which is what the retention window prunes by.
 * A deleted item remembers whether it had been marked read, so an undo puts back exactly that.
 */
export interface OverlayEntry {
    state: 'read' | 'deleted';
    at: number;
    prior?: 'read';
    /**
     * The item's chat number when this was done. A reaction keeps one id however often it is taken back
     * and given again, but each event has a number of its own: an entry for an earlier event does not
     * apply to a reaction given again.
     */
    no?: number;
}

/** How far one thread has been read on its own screen: its highest chat number read. */
export interface ThreadReadPoint {
    no: number;
    /** The sent time of the newest item read there — what the retention window prunes by. */
    at: number;
}

/**
 * The inbox's own state, kept per device: exceptions only, never a copy of an item. Everything else
 * an item shows — its text, its kind, whether its room's cursor has passed it — is worked out from the
 * cached rows each time.
 */
export interface NotificationOverlay {
    entries: Record<string, OverlayEntry>;
    /** Keyed by `threadKey`. */
    threads: Record<string, ThreadReadPoint>;
    /**
     * When this overlay was started (epoch ms): a thread item sent before it reads as read. A room's
     * cursor never reads a thread item, so without this every thread reply already in the cache would
     * light up as new the first time the inbox reads it — after an update, on a new device, after a
     * cache clear or a sign-in. What this device could not have seen is not news.
     */
    baselineAt: number;
}

/** An overlay with nothing done yet, started at `now`. */
export const freshOverlay = (now: number): NotificationOverlay => ({ entries: {}, threads: {}, baselineAt: now });

/** Empty and started at the beginning of time — every thread item can still be unread. For tests. */
export const EMPTY_OVERLAY: NotificationOverlay = freshOverlay(0);

const threadKeyOf = (item: NotificationItem): string | undefined =>
    item.parentId ? threadKey(item.cloudId, item.channelId, threadRootNo(item.parentId)) : undefined;

/** The entry for an item, unless it was made for another event of the same reaction. */
const entryFor = (overlay: NotificationOverlay, item: NotificationItem): OverlayEntry | undefined => {
    const entry = overlay.entries[item.id];
    return entry && (entry.no === undefined || entry.no === item.chatNo) ? entry : undefined;
};

/**
 * The items as the reader sees them: those sent before `cutoff` left out (the window ages while a quiet
 * room's rows stand still), deleted ones left out, and read when the rows say so, when they were marked
 * read, or — for an item in a thread — when its thread has been read past it or it predates the overlay.
 * A room's cursor never marks a thread item read; a thread is read on its own screen.
 */
export const applyOverlay = (
    computed: NotificationItems,
    overlay: NotificationOverlay,
    cutoff: number
): NotificationItems => {
    const items: NotificationItems = {};
    for (const [id, item] of Object.entries(computed)) {
        if (item.createdAt < cutoff) continue;
        const entry = entryFor(overlay, item);
        if (entry?.state === 'deleted') continue;
        const key = threadKeyOf(item);
        const threadRead = key
            ? item.createdAt < overlay.baselineAt || (item.chatNo ?? 0) <= (overlay.threads[key]?.no ?? 0)
            : false;
        const read = item.read || entry?.state === 'read' || threadRead;
        items[id] = read === item.read ? item : { ...item, read };
    }
    return items;
};

/** The change an action made, and the overlay after it. `overlay` is the one given when nothing changed. */
export interface OverlayChange<T> {
    overlay: NotificationOverlay;
    changed: T[];
}

/** Marks those of `ids` that are shown and unread as read. */
export const markReadIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    ids: readonly string[]
): OverlayChange<string> => {
    const changed = ids.filter(id => items[id] && !items[id].read);
    if (changed.length === 0) return { overlay, changed };
    const entries = { ...overlay.entries };
    for (const id of changed) entries[id] = { state: 'read', at: items[id].createdAt, no: items[id].chatNo };
    return { overlay: { ...overlay, entries }, changed };
};

/**
 * The undo of {@link markReadIn}: those of `ids` marked read by hand go back to what the rules say.
 * An item `markReadIn` changed was unread, so the rules said unread.
 */
export const markUnreadIn = (overlay: NotificationOverlay, ids: readonly string[]): NotificationOverlay => {
    const held = ids.filter(id => overlay.entries[id]?.state === 'read');
    if (held.length === 0) return overlay;
    const entries = { ...overlay.entries };
    for (const id of held) delete entries[id];
    return { ...overlay, entries };
};

/** Deletes those of `ids` that are shown. The items go off the inbox only; the messages stay. */
export const removeIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    ids: readonly string[]
): OverlayChange<NotificationItem> => {
    const changed = ids.map(id => items[id]).filter((item): item is NotificationItem => !!item);
    if (changed.length === 0) return { overlay, changed };
    const entries = { ...overlay.entries };
    for (const item of changed) {
        const prior = entryFor(overlay, item)?.state === 'read' ? ('read' as const) : undefined;
        entries[item.id] = { state: 'deleted', at: item.createdAt, no: item.chatNo, ...(prior ? { prior } : {}) };
    }
    return { overlay: { ...overlay, entries }, changed };
};

/** The undo of {@link removeIn}: the items come back as they were, read by hand when they had been. */
export const restoreIn = (overlay: NotificationOverlay, removed: readonly NotificationItem[]): NotificationOverlay => {
    const held = removed.filter(item => overlay.entries[item.id]?.state === 'deleted');
    if (held.length === 0) return overlay;
    const entries = { ...overlay.entries };
    for (const item of held) {
        const entry = entries[item.id];
        if (entry.prior === 'read') entries[item.id] = { state: 'read', at: entry.at, no: entry.no };
        else delete entries[item.id];
    }
    return { ...overlay, entries };
};

/**
 * A thread's screen was open: everything the inbox holds for it so far is read. Replies that arrive
 * later carry higher numbers and stay unread until the thread is read again.
 */
export const markThreadReadIn = (
    overlay: NotificationOverlay,
    items: NotificationItems,
    cloudId: string,
    channelId: string,
    rootNo: string
): NotificationOverlay => {
    const key = threadKey(cloudId, channelId, rootNo);
    let no = 0;
    let at = 0;
    for (const item of Object.values(items)) {
        if (threadKeyOf(item) !== key) continue;
        no = Math.max(no, item.chatNo ?? 0);
        at = Math.max(at, item.createdAt);
    }
    const held = overlay.threads[key];
    if (no === 0 || (held && held.no >= no)) return overlay;
    return { ...overlay, threads: { ...overlay.threads, [key]: { no, at: Math.max(at, held?.at ?? 0) } } };
};

/**
 * Drops what the reader did to items sent before `cutoff`. Only the sent time decides: an entry is kept
 * while its row is gone from the cache, so a row fetched again after a cache clear is still deleted.
 */
export const pruneOverlay = (overlay: NotificationOverlay, cutoff: number): NotificationOverlay => {
    const staleEntries = Object.keys(overlay.entries).filter(id => overlay.entries[id].at < cutoff);
    const staleThreads = Object.keys(overlay.threads).filter(key => overlay.threads[key].at < cutoff);
    if (staleEntries.length === 0 && staleThreads.length === 0) return overlay;
    const entries = { ...overlay.entries };
    const threads = { ...overlay.threads };
    for (const id of staleEntries) delete entries[id];
    for (const key of staleThreads) delete threads[key];
    return { ...overlay, entries, threads };
};
